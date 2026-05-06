import { getProofBlobUrl, getProofStorageMode, isLocalFallbackBlob } from "../lib/proof";

interface ProofItem {
  label: string;
  blobId?: string | null;
}

interface ProofPanelProps {
  title?: string;
  items: ProofItem[];
  walletAddress?: string | null;
  ownerAddress?: string | null;
  sealMode: string;
}

function ProofBlobRow({ label, blobId }: ProofItem) {
  const url = getProofBlobUrl(blobId);

  return (
    <div className="proof-row">
      <span>{label}</span>
      <div className="proof-row-value">
        <strong className="blob-prominent">{blobId ?? "Not stored"}</strong>
        {blobId ? (
          isLocalFallbackBlob(blobId) ? (
            <span className="pill">Local fallback</span>
          ) : url ? (
            <a href={url} target="_blank" rel="noreferrer">
              Open Blob
            </a>
          ) : null
        ) : null}
      </div>
    </div>
  );
}

export function ProofPanel({
  title = "Proof Mode",
  items,
  walletAddress,
  ownerAddress,
  sealMode,
}: ProofPanelProps) {
  const storageMode = getProofStorageMode(items.map((item) => item.blobId));

  return (
    <section className="panel proof-panel">
      <div className="section-row">
        <div>
          <p className="eyebrow">Proof Mode</p>
          <h3>{title}</h3>
        </div>
        <span className={`pill ${storageMode === "Walrus" ? "proof-pill" : ""}`}>{storageMode}</span>
      </div>

      <div className="proof-grid">
        {items.map((item) => (
          <ProofBlobRow key={item.label} {...item} />
        ))}
        <div className="proof-row">
          <span>Storage mode</span>
          <strong>{storageMode}</strong>
        </div>
        <div className="proof-row">
          <span>Seal mode</span>
          <strong>{sealMode}</strong>
        </div>
        <div className="proof-row">
          <span>Current wallet address</span>
          <strong className="blob-prominent">{walletAddress ?? "Not connected"}</strong>
        </div>
        <div className="proof-row">
          <span>Form ownerAddress</span>
          <strong className="blob-prominent">{ownerAddress ?? "Legacy demo form"}</strong>
        </div>
      </div>
    </section>
  );
}
