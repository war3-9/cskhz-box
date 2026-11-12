import { createRoot } from "react-dom/client";
import { lazy, Suspense } from 'react';
import { ErrorBoundary } from "./app/ErrorBoundary";
import './app/theme/theme.css';
import './home/glass.css';
import './app/textSelection';
const Entry = new URLSearchParams(location.search).has('object-palette')
  ? lazy(() => import('./object-table/palette/PaletteWindow').then(module => ({ default: module.PaletteWindow })))
  : lazy(() => import('./app/App'));
createRoot(document.getElementById("root")!).render(<ErrorBoundary><Suspense fallback={null}><Entry /></Suspense></ErrorBoundary>);
