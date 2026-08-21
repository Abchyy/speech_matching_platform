#!/usr/bin/env python3
"""People.cn speech corpus crawler (Raw Capture only).

Smoke test:
    python scripts/crawler/crawl.py --smoke

Full quota crawl (~100 articles across configured themes):
    python scripts/crawler/crawl.py --full
"""

from __future__ import annotations

import argparse
import json
import math
import sys
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
if str(HERE) not in sys.path:
    sys.path.insert(0, str(HERE))

from logutil import Logger  # noqa: E402
from people_cn import FetchError, PeopleCnClient  # noqa: E402
from quality import (  # noqa: E402
    body_too_short,
    count_exact_phrase,
    listing_should_skip,
    related_terms_for_theme,
    relevance_should_skip,
    title_should_skip,
)
from store import CorpusStore  # noqa: E402


REPO_ROOT = HERE.parents[1]
DEFAULT_CONFIG = HERE / "config" / "topics.json"


def load_config(path: Path) -> dict:
    with path.open("r", encoding="utf-8") as fh:
        return json.load(fh)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Crawl People.cn speech database")
    parser.add_argument(
        "--config",
        default=str(DEFAULT_CONFIG),
        help="Path to topics.json",
    )
    parser.add_argument(
        "--smoke",
        action="store_true",
        help="Fetch 2-3 articles for a single keyword (科技创新)",
    )
    parser.add_argument(
        "--full",
        action="store_true",
        help="Crawl all themes by quota toward total_target",
    )
    parser.add_argument("--keyword", default=None, help="Override search keyword")
    parser.add_argument(
        "--max-articles",
        type=int,
        default=None,
        help="Hard cap on corpus size for this run",
    )
    parser.add_argument(
        "--max-pages",
        type=int,
        default=None,
        help="Override max search pages per keyword",
    )
    return parser.parse_args()


def keyword_cap_for_theme(target: int, n_keywords: int, *, raised: bool = False) -> int:
    """Prevent one keyword from filling a whole theme quota.

    Under-quota backfill uses a higher cap (the theme target) so title-native
    keywords such as 乡村振兴 can keep producing new primary articles.
    """
    if raised:
        return max(target, 2)
    if n_keywords <= 0:
        return target
    return max(2, math.ceil(target / n_keywords) + 1)


def print_stats(store: CorpusStore, config: dict, logger: Logger, failures_before: int) -> None:
    articles = store.metadata.get("articles") or []
    logger.info("========== crawl stats ==========")
    logger.info(f"成功保存文章数: {len(articles)}")
    logger.info(f"失败记录数: {len(store.failures)}")
    logger.info(f"本次新增失败: {max(0, len(store.failures) - failures_before)}")

    missing_date = sum(1 for a in articles if not a.get("date"))
    missing_origin = sum(1 for a in articles if not a.get("origin"))
    logger.info(f"缺失日期数量: {missing_date}")
    logger.info(f"缺失来源数量: {missing_origin}")

    logger.info("各主题（主分类 / 含交叉命中）:")
    for theme in config.get("themes") or []:
        theme_id = theme.get("id")
        target = int(theme.get("target") or 0)
        primary = store.primary_theme_count(theme_id)
        hits = store.theme_hit_count(theme_id)
        status = "OK" if primary >= target else f"不足 {target - primary}"
        logger.info(
            f"  {theme_id} {theme.get('name')}: primary={primary}/{target}, "
            f"tagged={hits} [{status}]"
        )

    logger.info("各关键词命中数量:")
    for theme in config.get("themes") or []:
        for keyword in theme.get("keywords") or []:
            logger.info(f"  {keyword}: {store.keyword_count(keyword)}")
    logger.info("=================================")


def main() -> int:
    args = parse_args()
    if not args.smoke and not args.full:
        print("Specify --smoke or --full. Full crawl is explicit after smoke confirmation.")
        return 2

    config = load_config(Path(args.config))
    logger = Logger(REPO_ROOT / "corpus" / "crawler.log")
    store = CorpusStore(REPO_ROOT, logger)
    client = PeopleCnClient(config["crawler"], logger)
    quality_cfg = config.get("quality") or {}
    exclude_patterns = quality_cfg.get("title_exclude_patterns") or []
    min_body_chars = int(quality_cfg.get("min_body_chars") or 200)
    min_keyword_hits = int(quality_cfg.get("min_keyword_hits_in_body") or 3)
    keywords_by_theme = {
        theme.get("id"): list(theme.get("keywords") or [])
        for theme in (config.get("themes") or [])
        if theme.get("id")
    }
    default_pages = int(config["crawler"].get("max_pages_per_keyword") or 10)
    max_pages = args.max_pages or default_pages
    failures_before = len(store.failures)

    if args.smoke:
        total_target = args.max_articles or 3
        jobs = [
            {
                "keyword": args.keyword or "科技创新",
                "theme_id": "tech_innovation",
                "theme_target": total_target,
                "keyword_cap": total_target,
                "pages": args.max_pages or 3,
            }
        ]
        logger.info(
            f"Smoke test: keyword={jobs[0]['keyword']!r}, total_target={total_target}"
        )
    else:
        total_target = args.max_articles or int(config.get("total_target") or 100)
        jobs = []
        skipped_full = []
        for theme in config.get("themes") or []:
            theme_id = theme.get("id")
            keywords = list(theme.get("keywords") or [])
            target = int(theme.get("target") or 0)
            if store.primary_theme_count(theme_id) >= target:
                skipped_full.append(theme_id)
                continue
            cap = keyword_cap_for_theme(target, len(keywords), raised=True)
            for keyword in keywords:
                jobs.append(
                    {
                        "keyword": keyword,
                        "theme_id": theme_id,
                        "theme_target": target,
                        "keyword_cap": cap,
                        "pages": max_pages,
                    }
                )
        logger.info(
            f"Full crawl: total_target={total_target}, jobs={len(jobs)}, "
            f"max_pages={max_pages}, already_saved={store.saved_count()}, "
            f"skip_full_themes={skipped_full}"
        )

    saved_before = store.saved_count()
    new_saved = 0
    consecutive_errors = 0
    max_consecutive = int(config["crawler"].get("max_consecutive_errors") or 3)
    stop_all = False

    try:
        for job in jobs:
            if stop_all:
                break
            keyword = job["keyword"]
            theme_id = job["theme_id"]
            theme_target = int(job["theme_target"])
            keyword_cap = int(job["keyword_cap"])
            pages = int(job["pages"])

            if store.saved_count() >= total_target:
                logger.info(f"Reached total_target={total_target}; stopping")
                break
            if store.primary_theme_count(theme_id) >= theme_target:
                logger.info(f"Theme quota filled: {theme_id} ({theme_target})")
                continue
            if store.primary_keyword_count(keyword) >= keyword_cap:
                logger.info(
                    f"Keyword cap filled: {keyword!r} "
                    f"({store.primary_keyword_count(keyword)}/{keyword_cap})"
                )
                continue

            logger.info(
                f"Search keyword={keyword!r} theme={theme_id} "
                f"theme_primary={store.primary_theme_count(theme_id)}/{theme_target} "
                f"keyword_primary={store.primary_keyword_count(keyword)}/{keyword_cap}"
            )
            skip_keyword = False
            for page in range(1, pages + 1):
                if skip_keyword:
                    break
                if stop_all:
                    break
                if store.saved_count() >= total_target:
                    stop_all = True
                    break
                if store.primary_theme_count(theme_id) >= theme_target:
                    break
                if store.primary_keyword_count(keyword) >= keyword_cap:
                    break

                search_url = client.search_url(keyword, page)
                logger.info(f"GET {search_url}")
                try:
                    html = client.get(search_url)
                    hits, total = client.parse_search_results(html)
                    consecutive_errors = 0
                except FetchError as exc:
                    consecutive_errors += 1
                    logger.error(f"Search failed ({keyword} page={page}): {exc}")
                    store.record_failure(search_url, keyword, str(exc))
                    if consecutive_errors >= max_consecutive:
                        logger.warn(
                            f"Too many consecutive errors; skipping keyword {keyword!r}"
                        )
                        consecutive_errors = 0
                        skip_keyword = True
                        break
                    continue

                logger.info(
                    f"Search parsed: page={page}, hits={len(hits)}, total={total}"
                )
                if not hits:
                    logger.warn(f"No search hits on page {page} for {keyword}")
                    break

                theme_keywords = keywords_by_theme.get(theme_id) or []
                related_terms = related_terms_for_theme(theme_id)
                for hit in hits:
                    if store.saved_count() >= total_target:
                        stop_all = True
                        break
                    if store.primary_theme_count(theme_id) >= theme_target:
                        break
                    if store.primary_keyword_count(keyword) >= keyword_cap:
                        break

                    existing = store.find_by_url(hit.url) or store.find_by_article_id(
                        hit.article_id
                    )
                    if existing:
                        changed = store.merge_hits(existing, keyword, theme_id)
                        if changed:
                            store.rewrite_markdown_front_matter(existing)
                            store.save()
                            logger.info(
                                f"Merged keyword {keyword!r} into {existing['id']}"
                            )
                        else:
                            logger.skip(f"Already saved {existing['id']} {hit.url}")
                        continue

                    skip_reason = title_should_skip(hit.title, exclude_patterns)
                    if skip_reason:
                        logger.skip(
                            f"Title filtered ({skip_reason}): {hit.title} {hit.url}"
                        )
                        continue

                    skip_reason = listing_should_skip(
                        hit.title,
                        hit.snippet,
                        keyword,
                        theme_keywords,
                        related_terms,
                    )
                    if skip_reason:
                        logger.skip(
                            f"{skip_reason}: {hit.title} {hit.url}"
                        )
                        continue

                    logger.info(f"GET detail {hit.url}")
                    try:
                        detail_html = client.get(hit.url)
                        detail = client.parse_detail(detail_html, hit.url)
                        consecutive_errors = 0
                    except FetchError as exc:
                        consecutive_errors += 1
                        logger.error(f"Detail failed {hit.url}: {exc}")
                        store.record_failure(hit.url, keyword, str(exc))
                        if consecutive_errors >= max_consecutive:
                            logger.warn(
                                f"Too many consecutive errors; skipping keyword {keyword!r}"
                            )
                            consecutive_errors = 0
                            skip_keyword = True
                            break
                        continue

                    if not detail.get("date"):
                        if hit.date:
                            detail["date"] = hit.date
                            logger.warn(
                                f"Detail date missing; used search date {hit.date} for {hit.url}"
                            )
                        else:
                            logger.warn(f"Date missing: {hit.url}")
                    if not detail.get("origin"):
                        if hit.origin:
                            detail["origin"] = hit.origin
                        else:
                            logger.warn(f"Origin missing: {hit.url}")

                    if body_too_short(detail["body"], min_body_chars):
                        logger.skip(f"Body too short: {hit.url}")
                        store.record_failure(hit.url, keyword, "body_too_short")
                        continue

                    skip_reason = title_should_skip(detail["title"], exclude_patterns)
                    if skip_reason:
                        logger.skip(
                            f"Detail title filtered ({skip_reason}): {detail['title']}"
                        )
                        continue

                    keyword_hits = count_exact_phrase(detail["body"], keyword)
                    skip_reason = relevance_should_skip(
                        detail["title"],
                        detail["body"],
                        keyword,
                        theme_keywords,
                        min_keyword_hits,
                        related_terms=related_terms,
                    )
                    if skip_reason:
                        logger.skip(
                            f"Topic filtered ({skip_reason}): {detail['title']} {hit.url}"
                        )
                        continue

                    record = {
                        "title": detail["title"],
                        "date": detail.get("date"),
                        "source": "人民网",
                        "origin": detail.get("origin") or hit.origin,
                        "url": hit.url,
                        "article_id": hit.article_id,
                        "keyword_hit_count": keyword_hits,
                        "_keyword": keyword,
                        "_theme_id": theme_id,
                    }
                    try:
                        store.save_article(record, detail["body"])
                    except OSError:
                        consecutive_errors += 1
                        if consecutive_errors >= max_consecutive:
                            store.save()
                            print_stats(store, config, logger, failures_before)
                            return 1
                        continue
                    new_saved += 1
                    store.save()
                if skip_keyword:
                    break
    finally:
        store.save()
        client.close()

    logger.info(
        f"Run finished. new_saved={new_saved}, corpus_total={store.saved_count()}, "
        f"before={saved_before}, failures={len(store.failures)}"
    )
    print_stats(store, config, logger, failures_before)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
