import { StyledSelect } from '../shared/components/StyledSelect';
import { Settings2 } from "lucide-react";
import { BatchField } from "./BatchHelp";
import { batchFormats, type BatchFormat } from "./batchConfig";
import { blpSizes } from "./gameFormats/settings";
import { BatchNamingFields } from "./BatchNamingFields";
import { IconPairFields } from './iconPairs/Fields';
import type { IconPairOptions } from './iconPairs/config';
import { BatchDirectoryField } from './BatchDirectoryField';
import { OutputFolderField } from './OutputFolderField';
interface Props {
  count: number;
  setCount: (value: number) => void;
  names: string[];
  setNames: (value: string[]) => void;
  numberFilenames: boolean;
  setNumberFilenames: (value: boolean) => void;
  format: BatchFormat;
  setFormat: (value: BatchFormat) => void;
  directory: string;
  setDirectory: (value: string) => void;
  outputFolder: string;
  setOutputFolder: (value: string) => void;
  reportError: (message: string) => void;
  blpSize: number;
  setBlpSize: (value: number) => void;
  namingMode: "txt" | "ai";
  setNamingMode: (value: "txt" | "ai") => void;
  aiReady: boolean;
  aiModel: string;
  iconPairs: IconPairOptions;
  setIconPairs: (value: IconPairOptions) => void;
}
export function BatchOutputFields(props: Props) {
  return (
    <section className="batch-section batch-output">
      <h3>
        <Settings2 size={17} />
        输出设置
      </h3>
      <BatchField
        label="批量导出的张数"
        id="batch-count"
        help="填写 1–10000 的整数。默认等于分类内的素材数量；数量更多时循环使用素材。"
      >
        <input
          id="batch-count"
          aria-label="批量张数"
          type="number"
          min="1"
          max="10000"
          step="1"
          value={props.count}
          onChange={(event) => props.setCount(Number(event.target.value))}
        />
      </BatchField>
      <BatchNamingFields {...props} hidden={props.iconPairs.enabled} />
      {props.iconPairs.enabled && <IconPairFields options={props.iconPairs} update={props.setIconPairs} />}
      <BatchField
        label="图片格式"
        id="batch-format"
        help="支持 PNG、JPEG、WebP、BMP、GIF、TIFF、TGA 和 BLP1。TGA 保留 32 位透明度；BLP 面向魔兽争霸，采用 256 色、独立透明度及完整 mipmap。"
      >
        <StyledSelect
          id="batch-format"
          aria-label="批量图片格式"
          disabled={props.iconPairs.enabled}
          value={props.format}
          onChange={(event) =>
            props.setFormat(event.target.value as BatchFormat)
          }
        >
          {(props.iconPairs.enabled ? ['blp'] : batchFormats).map((format) => (
            <option key={format} value={format}>
              {format.toUpperCase()}
            </option>
          ))}
        </StyledSelect>
      </BatchField>
      {props.format === "blp" && (
        <BatchField
          label="BLP 尺寸"
          id="batch-blp-size"
          help="BLP 使用 2 的幂尺寸。自动按画布宽高分别向上取整（122 变 128，300 变 512）；指定尺寸会缩放为正方形。原任务不变。"
        >
          <StyledSelect
            id="batch-blp-size"
            aria-label="BLP 尺寸"
            value={props.blpSize}
            onChange={(event) => props.setBlpSize(Number(event.target.value))}
          >
            <option value="0">自动（按画布取整）</option>
            {blpSizes.map((size) => (
              <option key={size} value={size}>
                {size} × {size}
              </option>
            ))}
          </StyledSelect>
        </BatchField>
      )}
      <BatchDirectoryField directory={props.directory} setDirectory={props.setDirectory}
        reportError={props.reportError} paired={props.iconPairs.enabled} />
      {!props.iconPairs.enabled && !!props.directory && <OutputFolderField value={props.outputFolder} update={props.setOutputFolder} />}
    </section>
  );
}
