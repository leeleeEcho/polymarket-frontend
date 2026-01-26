"use client";

import { useState } from "react";
import { useCreateDispute } from "@/hooks/useP2PApi";

interface DisputeFormProps {
  orderId: string;
  onClose: () => void;
  onSuccess: () => void;
}

const DISPUTE_REASONS = [
  { value: "no_payment", label: "Buyer did not pay" },
  { value: "wrong_amount", label: "Incorrect payment amount" },
  { value: "no_release", label: "Merchant did not release USDC" },
  { value: "fraud", label: "Suspected fraud" },
  { value: "other", label: "Other reason" },
];

export function DisputeForm({ orderId, onClose, onSuccess }: DisputeFormProps) {
  const { createDispute, loading, error } = useCreateDispute();

  const [reason, setReason] = useState("");
  const [description, setDescription] = useState("");
  const [evidenceUrls, setEvidenceUrls] = useState<string[]>([]);
  const [newUrl, setNewUrl] = useState("");

  const handleAddUrl = () => {
    if (newUrl && !evidenceUrls.includes(newUrl)) {
      setEvidenceUrls([...evidenceUrls, newUrl]);
      setNewUrl("");
    }
  };

  const handleRemoveUrl = (url: string) => {
    setEvidenceUrls(evidenceUrls.filter((u) => u !== url));
  };

  const handleSubmit = async () => {
    if (!reason || !description) return;

    try {
      await createDispute(orderId, {
        reason,
        description,
        evidence_urls: evidenceUrls.length > 0 ? evidenceUrls : undefined,
      });
      onSuccess();
    } catch (err) {
      console.error("Failed to create dispute:", err);
    }
  };

  const isValid = reason && description.length >= 10;

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="card-9v max-w-md w-full shadow-xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border sticky top-0 bg-card">
          <h2 className="text-lg font-medium text-foreground">Open Dispute</h2>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground transition"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4">
          {/* Warning */}
          <div className="bg-warning/10 border border-warning/30 rounded-lg p-3">
            <p className="text-warning text-sm">
              Please submit disputes responsibly. All disputes are reviewed by platform arbitrators. Malicious disputes may result in account restrictions.
            </p>
          </div>

          {/* Reason */}
          <div>
            <label className="block text-sm text-muted-foreground mb-2">
              Reason <span className="text-destructive">*</span>
            </label>
            <select
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full bg-input text-foreground rounded-lg px-3 py-2 border border-border focus:border-foreground/50 focus:outline-none"
            >
              <option value="">Select a reason</option>
              {DISPUTE_REASONS.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm text-muted-foreground mb-2">
              Description <span className="text-destructive">*</span>
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Please describe the issue in detail (min 10 characters)"
              className="w-full bg-input text-foreground rounded-lg px-3 py-2 border border-border focus:border-foreground/50 focus:outline-none resize-none"
              rows={4}
            />
            <p className="text-xs text-muted-foreground mt-1">
              {description.length}/500 characters
            </p>
          </div>

          {/* Evidence URLs */}
          <div>
            <label className="block text-sm text-muted-foreground mb-2">
              Evidence Links (optional)
            </label>
            <div className="flex gap-2">
              <input
                type="url"
                value={newUrl}
                onChange={(e) => setNewUrl(e.target.value)}
                placeholder="Paste image or file URL"
                className="flex-1 bg-input text-foreground rounded-lg px-3 py-2 text-sm border border-border focus:border-foreground/50 focus:outline-none font-mono"
              />
              <button
                onClick={handleAddUrl}
                disabled={!newUrl}
                className="px-4 py-2 bg-secondary text-muted-foreground rounded-lg hover:bg-secondary/80 hover:text-foreground transition disabled:opacity-50"
              >
                Add
              </button>
            </div>

            {/* Evidence List */}
            {evidenceUrls.length > 0 && (
              <div className="mt-2 space-y-2">
                {evidenceUrls.map((url, index) => (
                  <div
                    key={index}
                    className="flex items-center gap-2 bg-secondary rounded-lg px-3 py-2"
                  >
                    <span className="flex-1 text-sm text-muted-foreground truncate font-mono">
                      {url}
                    </span>
                    <button
                      onClick={() => handleRemoveUrl(url)}
                      className="text-destructive hover:text-destructive/80"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            )}
            <p className="text-xs text-muted-foreground mt-1">
              Screenshots, chat logs, payment receipts accepted
            </p>
          </div>

          {/* Error */}
          {error && (
            <div className="card-9v p-3 border-destructive/50">
              <p className="text-destructive text-sm">{error}</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-border flex gap-3 sticky bottom-0 bg-card">
          <button
            onClick={onClose}
            className="flex-1 py-3 bg-secondary text-muted-foreground rounded-lg hover:bg-secondary/80 hover:text-foreground transition font-medium"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!isValid || loading}
            className="flex-1 py-3 bg-destructive text-white rounded-lg hover:bg-destructive/90 transition disabled:opacity-50 disabled:cursor-not-allowed font-medium"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <span className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
                Submitting...
              </span>
            ) : (
              "Submit Dispute"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
