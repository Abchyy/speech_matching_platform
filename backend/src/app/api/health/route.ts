import { jsonOk, readRequestId } from "@/lib/http";
import { appConfig, deepseekConfig, embeddingConfig, workflowStages } from "@/lib/config";
import { defaultChunkRepository } from "@/lib/corpus";
import { FileIndexRegistry } from "@/lib/index";

export async function GET(request: Request) {
  const requestId = readRequestId(request);
  const snapshot = defaultChunkRepository.getSnapshot?.();
  let indexReady = false;
  let indexVersion: string | undefined;
  let indexError: string | undefined;
  try {
    if (!snapshot) {
      throw new Error("缺少 corpus snapshot");
    }
    const active = await new FileIndexRegistry().assertReadyForQuery(
      snapshot,
      {
        provider: "dashscope",
        model: embeddingConfig.model,
        dimensions: embeddingConfig.dimensions,
      },
      defaultChunkRepository.listAll().map((chunk) => chunk.chunkId),
    );
    indexReady = true;
    indexVersion = active.manifest.indexVersion;
  } catch (error) {
    indexError = error instanceof Error ? error.message : "index not ready";
  }

  return jsonOk(
    {
      status: indexReady ? "ok" : "not_ready",
      live: true,
      ready: indexReady,
      mockMode: appConfig.mockMode,
      vectorRetrieval: true,
      reranker: true,
      embeddingModel: embeddingConfig.model,
      rerankerModel: deepseekConfig.model,
      assetsGenerator: true,
      materialGenerator: true,
      index: {
        ready: indexReady,
        version: indexVersion,
        error: indexError,
      },
      workflowStages,
      endpoints: {
        match: "POST /api/match",
        profile: "POST /api/profile/generate",
        recommend: "POST /api/speeches/recommend",
        assets: "POST /api/assets/generate",
        material: "POST /api/material/generate",
      },
    },
    indexReady ? 200 : 503,
    requestId,
  );
}
