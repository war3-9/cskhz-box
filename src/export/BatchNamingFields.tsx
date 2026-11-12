import { StyledSelect } from '../shared/components/StyledSelect';
import { useRef, useState } from "react";
import { FileText, X } from "lucide-react";
import { isTauri } from "@tauri-apps/api/core";
import { BatchField } from "./BatchHelp";
import { parseNames } from "./batchConfig";
import { selectNamesFile } from "./batchIO";
export interface NamingProps {
  names: string[];
  setNames: (names: string[]) => void;
  numberFilenames: boolean;
  setNumberFilenames: (value: boolean) => void;
  namingMode: "txt" | "ai";
  setNamingMode: (mode: "txt" | "ai") => void;
  aiReady: boolean;
  aiModel: string;
  reportError: (error: string) => void;
  hidden?: boolean;
}
export function BatchNamingFields(props: NamingProps) {
  const file = useRef<HTMLInputElement>(null);
  const [filename, setFilename] = useState("");
  const select = async () => {
    try {
      if (!isTauri()) { file.current?.click(); return; }
      const selected = await selectNamesFile();
      if (selected) { props.setNames(parseNames(selected.text)); setFilename(selected.name); }
    } catch (error) { props.reportError(String(error)); }
  };
  return <div hidden={props.hidden}>
    <BatchField label="命名方式" id="batch-naming-mode" help="本地 TXT 和 AI 对接只能选择一种。AI 需要保存配置并测试连接，会将缩小后的道具图片发送到配置的服务。">
      <StyledSelect id="batch-naming-mode" aria-label="命名方式" value={props.namingMode} onChange={e => props.setNamingMode(e.target.value as "txt" | "ai")}>
        <option value="txt">本地 TXT</option>
        <option value="ai" disabled={!props.aiReady}>AI 对接{props.aiReady ? "" : "（请先配置并测试）"}</option>
      </StyledSelect>
      {props.namingMode === "ai" && <p className="batch-ai-model">AI 自动起名 · {props.aiModel}</p>}
    </BatchField>
    {props.namingMode === "txt" && <BatchField label="素材名称文件" id="batch-names" help="可选 UTF-8 TXT，每个非空行对应一个输出名称。未选择或名称不足时用 1、2、3 等数字补齐；非法字符会清理，重名追加序号。">
      <div className="batch-file-row">
        <button id="batch-names" type="button" onClick={() => void select()}><FileText size={16} />选择 TXT 文件</button>
        <span title={filename}>{filename || "未选择"}{props.names.length > 0 && ` · ${props.names.length} 个名称`}</span>
        {filename && <button type="button" className="batch-clear" title="清除名称文件" aria-label="清除名称文件" onClick={() => { props.setNames([]); setFilename(""); }}><X size={15} /></button>}
        <label className="batch-text-toggle batch-number-filenames" title="文件名前添加 0001_、0002_ 等序号；文件夹按名称升序排列即可保持 TXT 顺序。仅影响文件名。">
          <input type="checkbox" checked={props.numberFilenames} onChange={e => props.setNumberFilenames(e.target.checked)} />
          是否文件名增加序号
        </label>
      </div>
    </BatchField>}
    <input ref={file} hidden type="file" accept=".txt,text/plain" aria-label="素材名称 TXT 文件" onChange={async e => {
      const input = e.currentTarget, selected = input.files?.[0];
      try { if (selected) { props.setNames(parseNames(await selected.text())); setFilename(selected.name); } }
      catch (error) { props.reportError(String(error)); } finally { input.value = ""; }
    }} />
  </div>;
}
