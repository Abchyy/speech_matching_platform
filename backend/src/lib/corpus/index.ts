export type { ChunkRepository } from "./chunk-repository";
export { DemoChunkRepository } from "./demo-chunk-repository";

import type { ChunkRepository } from "./chunk-repository";
import { DemoChunkRepository } from "./demo-chunk-repository";

export const defaultChunkRepository: ChunkRepository = new DemoChunkRepository();
