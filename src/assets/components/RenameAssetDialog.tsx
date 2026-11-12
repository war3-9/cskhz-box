import { useState } from "react";
import type { Asset } from "../../shared/types";
import { Modal } from "../../shared/components/Modal";
import { useLibrary } from "../store";

export function RenameAssetDialog({
  asset,
  close,
}: {
  asset: Asset;
  close: () => void;
}) {
  const [name, setName] = useState(asset.name);
  return (
    <Modal title="重命名素材" close={close}>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          useLibrary.getState().renameAsset(asset.id, name.trim());
          close();
        }}
      >
        <label>
          名称
          <input
            autoFocus
            required
            maxLength={100}
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        <div className="dialog-actions">
          <button className="primary" disabled={!name.trim()}>
            保存
          </button>
        </div>
      </form>
    </Modal>
  );
}
