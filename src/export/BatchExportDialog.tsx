import { useEffect, useState } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { useTasks } from "../tasks/store";
import { useLibrary } from "../assets/store";
import { sortAssets, type AssetSort } from "../assets/sortAssets";
import { Modal } from "../shared/components/Modal";
import {
  categoryAssets,
  replaceableLayers,
  textLayers,
  validateBatch,
  type BatchFormat,
} from "./batchConfig";
import { BatchSourceFields } from "./BatchSourceFields";
import { BatchOutputFields } from "./BatchOutputFields";
import { blpDimensions } from "./gameFormats/settings";
import "./batch.css";
import { useAiStatus } from "../settings/aiStatus";
import { useBatchRun } from "./useBatchRun";
import { BatchFooter } from './BatchFooter';
import { defaultIconPairOptions, validateIconPairs } from './iconPairs/config';
import { useIconPairDirectory } from './iconPairs/useDirectory';
import { useOutputFolder, outputFolderError } from './outputFolder';

export function BatchExportDialog({ close }: { close: () => void }) {
  const { tasks, activeId } = useTasks();
  const { library } = useLibrary();
  const [taskId, setTaskId] = useState(activeId ?? tasks[0]?.id ?? "");
  const task = tasks.find((item) => item.id === taskId);
  const layers = task ? replaceableLayers(task.document) : [];
  const textTargets = task ? textLayers(task.document) : [];
  const [layerId, setLayerId] = useState(layers[0]?.id ?? "");
  const [replaceText, setReplaceText] = useState(false);
  const [textLayerId, setTextLayerId] = useState(textTargets[0]?.id ?? "");
  const categories = library.categories.filter(
    (category) => categoryAssets(library.assets, category).length,
  );
  const [categoryId, setCategoryId] = useState(
    categories.find((item) => item.id === "props")?.id ??
      categories[0]?.id ??
      "",
  );
  const [assetSort, setAssetSort] = useState<AssetSort>("natural");
  const assets = sortAssets(categoryAssets(
    library.assets,
    categories.find((item) => item.id === categoryId),
  ), assetSort);
  const [count, setCount] = useState(assets.length);
  const [names, setNames] = useState<string[]>([]);
  const [numberFilenames, setNumberFilenames] = useState(false);
  const [namingMode, setNamingMode] = useState<"txt" | "ai">("txt");
  const aiStatus = useAiStatus();
  const batchRun = useBatchRun();
  const { busy, setMessage } = batchRun;
  const [ordinaryFormat, setFormat] = useState<BatchFormat>("png");
  const [iconPairs, setIconPairs] = useState(defaultIconPairOptions);
  const format = iconPairs.enabled ? 'blp' : ordinaryFormat;
  const [blpSize, setBlpSize] = useState(0);
  const outputSize =
    task && format === "blp"
      ? blpDimensions(task.document.width, task.document.height, blpSize)
      : task?.document;
  const [directory, setDirectory] = useState(isTauri() ? "" : "浏览器下载目录");
  const { folder, setFolder } = useOutputFolder();
  const pairDirectory = useIconPairDirectory(iconPairs.enabled, directory);
  useEffect(() => {
    setLayerId(layers[0]?.id ?? "");
    setTextLayerId(textTargets[0]?.id ?? "");
  }, [taskId]);
  useEffect(() => {
    setCount(assets.length);
  }, [categoryId]);
  useEffect(() => { if (!aiStatus.ready && !busy) setNamingMode("txt"); }, [aiStatus.ready, busy]);
  const error = (!iconPairs.enabled && directory ? outputFolderError(folder) : '') || validateIconPairs(iconPairs) || pairDirectory.error || validateBatch(
    task?.document,
    layerId,
    assets,
    count,
    format,
    directory,
    replaceText,
    textLayerId,
  );
  const run = async () => {
    if (!task || error || pairDirectory.preparing) return;
    setMessage('');
    await batchRun.run({
          document: structuredClone(task.document),
          layerId,
          assets: structuredClone(assets),
          count,
          names,
          numberFilenames,
          format,
          directory,
          subdirectory: folder,
          replaceText,
          textLayerId,
          blpSize,
          namingMode,
          iconPairs: { ...iconPairs },
    });
  };
  return (
    <Modal
      title="批量导出"
      className="batch-modal"
      dismissDisabled={busy}
      close={() => {
        if (!busy) close();
      }}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void run();
        }}
      >
        <fieldset className="batch-grid" disabled={busy}>
          <BatchSourceFields
            tasks={tasks}
            taskId={taskId}
            setTaskId={setTaskId}
            layers={layers}
            layerId={layerId}
            setLayerId={setLayerId}
            categories={categories}
            allCategories={library.categories}
            categoryId={categoryId}
            setCategoryId={setCategoryId}
            assets={assets}
            assetSort={assetSort}
            setAssetSort={setAssetSort}
            replaceText={replaceText}
            setReplaceText={setReplaceText}
            generateIcons={iconPairs.enabled}
            setGenerateIcons={enabled => { setIconPairs({ ...iconPairs, enabled }); setMessage(''); }}
            textLayers={textTargets}
            textLayerId={textLayerId}
            setTextLayerId={setTextLayerId}
          />
          <BatchOutputFields
            count={count}
            setCount={setCount}
            names={names}
            setNames={setNames}
            numberFilenames={numberFilenames}
            setNumberFilenames={setNumberFilenames}
            format={format}
            setFormat={setFormat}
            directory={directory}
            setDirectory={selected => { setDirectory(selected); pairDirectory.retry(); setMessage(''); }}
            outputFolder={folder}
            setOutputFolder={setFolder}
            reportError={setMessage}
            blpSize={blpSize}
            setBlpSize={setBlpSize}
            namingMode={namingMode}
            setNamingMode={setNamingMode}
            aiReady={aiStatus.ready}
            aiModel={aiStatus.saved?.config.model ?? ""}
            iconPairs={iconPairs}
            setIconPairs={setIconPairs}
          />
        </fieldset>
        <BatchFooter outputSize={outputSize} count={count} format={format} paired={iconPairs.enabled}
          error={error} preparing={pairDirectory.preparing} run={batchRun} close={close} />
      </form>
    </Modal>
  );
}
