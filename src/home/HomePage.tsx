import { ArrowRight, Images, Box, Gamepad2, Mountain, TableProperties, PanelsTopLeft } from "lucide-react";
import background from "../../首页背景.jpg";
import brandLogo from "../assets/brand-logo.png";
import { UsageLicense } from './UsageLicense';
import "./home.css";
import "./entries.css";
import './font.css';

export function HomePage({
  enterEditor,
  enterViewer,
  enterWarcraft,
  enterTerrainClone,
  enterObjectTable,
  enterUiReplacement,
}: {
  enterEditor: () => void;
  enterViewer: () => void;
  enterWarcraft: () => void;
  enterTerrainClone: () => void;
  enterObjectTable: () => void;
  enterUiReplacement: () => void;
}) {
  return (
    <main className="home-page" aria-label="首页">
      <img
        className="home-background"
        src={background}
        alt=""
        draggable={false}
      />
      <nav className="home-functions" aria-label="功能入口">
        <div className="home-brand">
          <img className="home-brand-logo" src={brandLogo} alt="软件图标" />
        </div>
        <h1 className="home-title">超时空盒子 免费版</h1>
        <UsageLicense />
        <div className="home-entry-slot">
          <div className="home-function-view home-function-view-visible">
            <button
              className="home-entry"
              onClick={enterEditor}
            >
              <span className="home-entry-orbit" aria-hidden="true">
                <Images size={22} />
              </span>
              <span className="home-entry-label">图标制作</span>
              <span className="home-entry-arrow" aria-hidden="true">
                <ArrowRight size={19} />
              </span>
            </button>
            <button className="home-entry home-entry-secondary" onClick={enterViewer}>
              <span className="home-entry-orbit" aria-hidden="true"><Box size={22} /></span>
              <span className="home-entry-label">模型查看器</span>
              <span className="home-entry-arrow" aria-hidden="true"><ArrowRight size={19} /></span>
            </button>
            <button className="home-entry home-entry-secondary" onClick={enterWarcraft}>
              <span className="home-entry-orbit" aria-hidden="true"><Gamepad2 size={22} /></span>
              <span className="home-entry-label">魔兽 UI</span>
              <span className="home-entry-arrow" aria-hidden="true"><ArrowRight size={19} /></span>
            </button>
            <button className="home-entry home-entry-secondary" onClick={enterTerrainClone}>
              <span className="home-entry-orbit" aria-hidden="true"><Mountain size={22} /></span>
              <span className="home-entry-label">地形克隆</span>
              <span className="home-entry-arrow" aria-hidden="true"><ArrowRight size={19} /></span>
            </button>
            <button className="home-entry home-entry-secondary" onClick={enterUiReplacement}>
              <span className="home-entry-orbit" aria-hidden="true"><PanelsTopLeft size={22} /></span>
              <span className="home-entry-label">魔兽UI替换</span>
              <span className="home-entry-arrow" aria-hidden="true"><ArrowRight size={19} /></span>
            </button>
            <button className="home-entry home-entry-secondary" onClick={enterObjectTable}>
              <span className="home-entry-orbit" aria-hidden="true"><TableProperties size={22} /></span>
              <span className="home-entry-label">物编表格</span>
              <span className="home-entry-arrow" aria-hidden="true"><ArrowRight size={19} /></span>
            </button>
          </div>
        </div>
      </nav>
    </main>
  );
}
