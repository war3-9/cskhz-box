import { lazy, Suspense, useState } from "react";
import { HomePage } from "../home/HomePage";
import { IconWorkspaceLoader } from "./IconWorkspaceLoader";
import { TitleBar } from "./TitleBar";
import { useUi } from "./uiStore";
import { ModelViewerPage } from "../model-viewer/ModelViewerPage";
import { FeatureActivity } from './FeatureActivity';
import { CloseDialog } from './CloseDialog';
import { WarcraftPage } from '../warcraft-integration/WarcraftPage';
import { TerrainClonePage } from '../terrain-clone/TerrainClonePage';
import { ObjectTablePage } from '../object-table/ObjectTablePage';
import { ObjectSettingsDialog } from '../object-table/settings/SettingsDialog';
const UiReplacementPage = lazy(() => import('../ui-replacement/UiReplacementPage').then(module => ({ default: module.UiReplacementPage })));

export default function App() {
  const [page, setPage] = useState<"home" | "editor" | "viewer" | "warcraft" | "terrain" | "objects" | "replacement">("home");
  const [objectSettings, setObjectSettings] = useState(false);
  const [entered, setEntered] = useState({ editor: false, viewer: false, warcraft: false, terrain: false, objects: false, replacement: false });
  const navigate = (next: typeof page) => {
    if (next !== 'home') setEntered(value => ({ ...value, [next]: true }));
    setPage(next);
  };
  const message = useUi((state) => state.message);
  const tone = useUi((state) => state.tone);
  return (
    <div
      className={`app-shell app-${page}`}
      onContextMenu={(event) => event.preventDefault()}
    >
      {page === "home" ? (
        <>
          <TitleBar home />
          <HomePage enterEditor={() => navigate("editor")} enterViewer={() => navigate("viewer")} enterWarcraft={() => navigate("warcraft")} enterTerrainClone={() => navigate("terrain")} enterObjectTable={() => navigate("objects")} enterUiReplacement={() => navigate("replacement")} />
        </>
      ) : (
        null
      )}
      {entered.editor && <FeatureActivity.Provider value={page === 'editor'}><div className="feature-slot" hidden={page !== 'editor'}><IconWorkspaceLoader active={page === 'editor'} goHome={() => navigate('home')} /></div></FeatureActivity.Provider>}
      {entered.viewer && <FeatureActivity.Provider value={page === 'viewer'}><div className="feature-slot" hidden={page !== 'viewer'}><TitleBar viewer goHome={() => navigate('home')} /><ModelViewerPage active={page === 'viewer'} goHome={() => navigate('home')} /></div></FeatureActivity.Provider>}
      <CloseDialog />
      {entered.warcraft && <FeatureActivity.Provider value={page === 'warcraft'}><div className="feature-slot" hidden={page !== 'warcraft'}><WarcraftPage active={page === 'warcraft'} goHome={() => navigate('home')} /></div></FeatureActivity.Provider>}
      {entered.terrain && <FeatureActivity.Provider value={page === 'terrain'}><div className="feature-slot" hidden={page !== 'terrain'}><TitleBar viewer goHome={() => navigate('home')} /><TerrainClonePage /></div></FeatureActivity.Provider>}
      {entered.objects && <FeatureActivity.Provider value={page === 'objects'}><div className="feature-slot" hidden={page !== 'objects'}><TitleBar viewer goHome={() => navigate('home')} featureSettings={() => setObjectSettings(true)} featureSettingsLabel="物编表格设置" /><ObjectTablePage />{objectSettings && <ObjectSettingsDialog close={() => setObjectSettings(false)} />}</div></FeatureActivity.Provider>}
      {entered.replacement && <FeatureActivity.Provider value={page === 'replacement'}><div className="feature-slot" hidden={page !== 'replacement'}><TitleBar viewer goHome={() => navigate('home')} /><Suspense fallback={<div role="status">正在加载魔兽UI替换…</div>}><UiReplacementPage active={page === 'replacement'} /></Suspense></div></FeatureActivity.Provider>}
      {message && page !== 'viewer' && (
        <div className={`toast ${tone}`} role="status">
          {message}
        </div>
      )}
    </div>
  );
}
