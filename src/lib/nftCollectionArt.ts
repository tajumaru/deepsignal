import primeNftArt from "../assets/nft/prime.avif";
import tallyNftArt from "../assets/nft/tally.webp";
import {
  PRIME_MACHIN_COLLECTION_LABEL,
  PRIME_MACHIN_PRESET_ID,
  PRIME_MACHIN_STRUCT_TYPE,
  TALLY_COLLECTION_LABEL,
  TALLY_PRESET_ID,
  TALLY_STRUCT_TYPE,
} from "./formAccess";
import type { FormNftGate } from "../types";

export interface NftCollectionArtDescriptor {
  src: string;
  alt: string;
}

function normalizeNftValue(value: string | undefined) {
  return value?.trim().toLowerCase() ?? "";
}

export function resolveNftCollectionArt(nftGate: Pick<FormNftGate, "presetId" | "structType" | "collectionLabel"> | null | undefined) {
  if (!nftGate) {
    return null;
  }

  const presetId = nftGate.presetId;
  const structType = normalizeNftValue(nftGate.structType);
  const collectionLabel = nftGate.collectionLabel?.trim() || "NFT";
  const collectionLabelKey = normalizeNftValue(nftGate.collectionLabel);

  if (
    presetId === PRIME_MACHIN_PRESET_ID ||
    structType === normalizeNftValue(PRIME_MACHIN_STRUCT_TYPE) ||
    collectionLabelKey === normalizeNftValue(PRIME_MACHIN_COLLECTION_LABEL)
  ) {
    return {
      src: primeNftArt,
      alt: `${collectionLabel} NFT art`,
    } satisfies NftCollectionArtDescriptor;
  }

  if (
    presetId === TALLY_PRESET_ID ||
    structType === normalizeNftValue(TALLY_STRUCT_TYPE) ||
    collectionLabelKey === normalizeNftValue(TALLY_COLLECTION_LABEL)
  ) {
    return {
      src: tallyNftArt,
      alt: `${collectionLabel} NFT art`,
    } satisfies NftCollectionArtDescriptor;
  }

  return null;
}
