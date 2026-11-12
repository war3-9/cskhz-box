import { StyledSelect } from '../shared/components/StyledSelect';
import type { AssetSort } from '../assets/sortAssets';
import type { Asset, Category, ImageLayer } from "../shared/types";
import type { Task } from "../tasks/store";
import { Layers3 } from "lucide-react";
import { BatchField, BatchHelp } from "./BatchHelp";
import { IconPairToggle } from './iconPairs/Toggle';
interface Props {
  tasks: Task[];
  taskId: string;
  setTaskId: (value: string) => void;
  layers: ImageLayer[];
  layerId: string;
  setLayerId: (value: string) => void;
  categories: Category[];
  allCategories: Category[];
  categoryId: string;
  setCategoryId: (value: string) => void;
  assets: Asset[];
  assetSort: AssetSort;
  setAssetSort: (value: AssetSort) => void;
  replaceText: boolean;
  setReplaceText: (value: boolean) => void;
  generateIcons: boolean;
  setGenerateIcons: (value: boolean) => void;
  textLayers: ImageLayer[];
  textLayerId: string;
  setTextLayerId: (value: string) => void;
}
export function BatchSourceFields(props: Props) {
  return (
    <section className="batch-section">
      <h3>
        <Layers3 size={17} />
        素材与图层
      </h3>
      <BatchField
        label="选择任务"
        id="batch-task"
        help="选择作为导出模板的任务。批量处理使用独立副本，原任务、图层和撤销历史不会改变。"
      >
        <StyledSelect
          id="batch-task"
          aria-label="批量任务"
          value={props.taskId}
          onChange={(event) => props.setTaskId(event.target.value)}
        >
          {!props.tasks.length && <option value="">无任务</option>}
          {props.tasks.map((task) => (
            <option key={task.id} value={task.id}>
              {task.document.name}
            </option>
          ))}
        </StyledSelect>
      </BatchField>
      <BatchField
        label="需要更改的图层"
        id="batch-layer"
        help="选择要逐张替换的图片图层，底图和文字不在此列表中。新素材沿用该层宽高，居中到画布并清除旋转。"
      >
        <StyledSelect
          id="batch-layer"
          aria-label="批量图层"
          value={props.layerId}
          onChange={(event) => props.setLayerId(event.target.value)}
        >
          {!props.layers.length && <option value="">无可替换图片图层</option>}
          {props.layers.map((layer) => (
            <option key={layer.id} value={layer.id}>
              {layer.name}
            </option>
          ))}
        </StyledSelect>
      </BatchField>
      <div className="batch-options-row"><div className="batch-text-option">
        <label className="batch-text-toggle">
          <input
            type="checkbox"
            checked={props.replaceText}
            onChange={(event) => props.setReplaceText(event.target.checked)}
          />
          同时替换文字
        </label>
        <BatchHelp label="同时替换文字">
          勾选后可选择要替换的文字图层，文字使用每张图片的输出文件名（不含扩展名）。
          使用当前命名方式生成的名称替换指定文字图层；TXT 未选择或名称不足时使用数字序号，AI 使用识图生成的名称。
          文件名增加序号仅影响文件名，不会将序号添加到替换文字中。
          生成光暗图标时使用正常图标的文件名，暗图复用同一文字内容。
        </BatchHelp>
      </div>
      <IconPairToggle enabled={props.generateIcons} update={props.setGenerateIcons} /></div>
      {props.replaceText && (
        <BatchField
          label="文字图层"
          id="batch-text"
          help="选择随输出名称更新的文字图层，保留文字样式和当前变换。需要保留对应字体素材才能重新生成文字。"
        >
          <StyledSelect
            id="batch-text"
            aria-label="批量文字图层"
            value={props.textLayerId}
            onChange={(event) => props.setTextLayerId(event.target.value)}
          >
            {!props.textLayers.length && <option value="">无文字图层</option>}
            {props.textLayers.map((layer) => (
              <option key={layer.id} value={layer.id}>
                {layer.name}
              </option>
            ))}
          </StyledSelect>
        </BatchField>
      )}
      <BatchField
        label="素材分类"
        id="batch-category"
        help="选定分类内的图片按下方预览顺序依次替换。可以选择内置或用户分类；导出张数超过素材数量时从头循环。"
      >
        <StyledSelect
          id="batch-category"
          aria-label="批量素材分类"
          value={props.categoryId}
          onChange={(event) => props.setCategoryId(event.target.value)}
        >
          {props.categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.source === "builtin" ? "内置" : "用户"} ·{" "}
              {category.parentId
                ? `${props.allCategories.find((item) => item.id === category.parentId)?.name} / `
                : ""}
              {category.name}
            </option>
          ))}
        </StyledSelect>
      </BatchField>
      <div className="batch-preview-heading">
        <span>素材预览</span>
        <div className="batch-preview-controls">
          <small>{props.assets.length} 张</small>
          <StyledSelect aria-label="批量素材顺序" className="batch-sort-select" value={props.assetSort}
            onChange={event => props.setAssetSort(event.target.value as AssetSort)}>
            <option value="natural">名称顺序</option>
            <option value="descending">名称倒序</option>
            <option value="imported">导入顺序</option>
            <option value="reverse-imported">原始倒序</option>
          </StyledSelect>
        </div>
      </div>
      <div className="batch-assets">
        {props.assets.map((asset) => (
          <img
            key={asset.id}
            src={asset.thumbnailPath}
            alt={asset.name}
            title={asset.name}
          />
        ))}
      </div>
    </section>
  );
}
