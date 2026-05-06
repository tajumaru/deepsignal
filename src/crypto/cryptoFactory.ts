import type { SealAdapter } from "../types";
import { localSealMock } from "./localSealMock";

export const cryptoAdapter: SealAdapter = localSealMock;
