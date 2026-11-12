import { StyledSelect } from '../../shared/components/StyledSelect';
import { useEffect, useState } from "react";
import { RotateCcw, Check } from "lucide-react";
import type { ImageLayer } from "../../shared/types";
import { Modal } from "../../shared/components/Modal";
import { useEditor } from "../store";
import { useTasks } from "../../tasks/store";
import { useLibrary } from "../../assets/store";
import { normalizeEffects, defaultEffects } from "../effects";
import { useLayerDraft } from "./draftStore";
import { blendLabels, blendModes, effectLabels, type BlendMode } from "./types";
import { EffectFields } from "./EffectFields";
import { StylePreview } from "./StylePreview";
import { StyleNumber } from "./controls";
import { useTextDraft } from "./useTextDraft";
import { TextFields } from "./TextFields";
import { StyleNavigation, type StyleTab } from "./StyleNavigation";
import "./styles.css";

export function LayerStyleDialog({
  layer: target,
  close,
}: {
  layer: ImageLayer;
  close: () => void;
}) {
  const [layer] = useState(target);
  const current = useEditor((state) =>
    state.document.layers.find((item) => item.id === layer.id),
  );
  const taskId = useTasks((state) => state.activeId);
  const [originalTask] = useState(taskId);
  const [tab, setTab] = useState<StyleTab>("basic");
  const [effects, setEffects] = useState(() => normalizeEffects(layer.effects));
  const [opacity, setOpacity] = useState(layer.opacity);
  const [blendMode, setBlendMode] = useState<BlendMode>(
    layer.blendMode ?? "source-over",
  );
  const assets = useLibrary((state) => state.library.assets);
  const font = assets.find(
    (asset) => asset.kind === "font" && asset.id === layer.text?.fontId,
  );
  const text = useTextDraft(layer, font);
  const patch = { effects, opacity, blendMode, ...text.patch };
  const display = { ...layer, ...patch };
  const stale = current !== layer || taskId !== originalTask;
  const cancel = () => {
    useLayerDraft.getState().clear();
    close();
  };
  useEffect(() => {
    if (stale) {
      useLayerDraft.getState().clear();
      close();
      return;
    }
    useLayerDraft.getState().preview(layer, patch);
    return () => useLayerDraft.getState().clear();
  }, [layer, effects, opacity, blendMode, text.patch, stale, close]);
  const apply = () => {
    if (stale || layer.locked || text.busy || text.error) return;
    useEditor.getState().updateLayer(layer.id, patch);
    cancel();
  };
  return (
    <Modal
      title={`编辑图层 · ${layer.name}`}
      close={cancel}
      className="layer-style-dialog"
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          apply();
        }}
      >
        <div className="style-layout">
          <StyleNavigation
            tab={tab}
            select={setTab}
            effects={effects}
            change={setEffects}
            locked={layer.locked}
            text={!!layer.text}
          />
          <section className="style-parameters">
            <h3>
              {tab === "basic"
                ? "基础属性"
                : tab === "text"
                  ? "文字"
                  : effectLabels[tab]}
            </h3>
            <fieldset disabled={layer.locked}>
              {tab === "basic" ? (
                <>
                  <StyleNumber
                    label="图层不透明度"
                    value={opacity * 100}
                    max={100}
                    change={(value) => setOpacity(value / 100)}
                  />
                  <label>
                    混合模式
                    <StyledSelect
                      aria-label="样式混合模式"
                      value={blendMode}
                      onChange={(event) =>
                        setBlendMode(event.target.value as BlendMode)
                      }
                    >
                      {blendModes.map((mode) => (
                        <option key={mode} value={mode}>
                          {blendLabels[mode]}
                        </option>
                      ))}
                    </StyledSelect>
                  </label>
                </>
              ) : tab === "text" ? (
                font && text.text ? (
                  <TextFields text={text.text} change={text.setText} />
                ) : (
                  <p role="status">原字体不可用</p>
                )
              ) : (
                <>
                  <label className="style-check">
                    <input
                      aria-label="启用当前效果"
                      type="checkbox"
                      checked={effects[tab].enabled}
                      onChange={(event) =>
                        setEffects({
                          ...effects,
                          [tab]: {
                            ...effects[tab],
                            enabled: event.target.checked,
                          },
                        })
                      }
                    />
                    启用{effectLabels[tab]}
                  </label>
                  <fieldset disabled={!effects[tab].enabled}>
                    <EffectFields
                      name={tab}
                      effects={effects}
                      change={setEffects}
                    />
                  </fieldset>
                </>
              )}
            </fieldset>
            {text.error && <p role="alert">{text.error}</p>}
          </section>
          <StylePreview layer={display} original={layer} />
        </div>
        <footer className="style-footer">
          <button
            type="button"
            className="style-reset"
            disabled={layer.locked}
            onClick={() => {
              setEffects(defaultEffects());
              setOpacity(1);
              setBlendMode("source-over");
            }}
          >
            <RotateCcw size={14} />
            重置样式
          </button>
          <div className="dialog-actions">
            <button type="button" onClick={cancel}>
              取消
            </button>
            <button
              className="primary"
              disabled={layer.locked || text.busy || !!text.error || stale}
            >
              <Check size={14} />
              {text.busy ? "处理中" : "应用"}
            </button>
          </div>
        </footer>
      </form>
    </Modal>
  );
}
