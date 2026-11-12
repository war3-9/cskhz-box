import { useEffect, useRef, useState } from 'react';
import type { CategoryId } from '../schema';
import { templateIcon } from './icons';
import type { ObjectTemplate } from './catalog';
const bundledIcons = import.meta.glob<string>('./icons/*/*.png', { eager: true, query: '?url', import: 'default' });
export function TemplateIcon({ kind, entry, revision }: { kind: CategoryId; entry: ObjectTemplate; revision: number }) {
  const ref = useRef<HTMLSpanElement>(null), [image, setImage] = useState(bundledIcons[`./icons/${kind}/${entry.id}.png`] ?? '');
  useEffect(() => {
    let alive = true; const element = ref.current!;
    const observer = new IntersectionObserver(items => { if (!items.some(item => item.isIntersecting)) return; observer.disconnect(); void templateIcon(entry.art).then(url => { if (alive && url) setImage(url); }); }, { root: element.closest('.ot-template-tree'), rootMargin: '60px' });
    observer.observe(element); return () => { alive = false; observer.disconnect(); };
  }, [entry.art, revision]);
  return <span className="ot-template-icon" ref={ref}>{image ? <img width={28} height={28} src={image} alt={`${entry.name}图标`} loading="lazy" onError={() => setImage('')} /> : <span title="该模板没有可用图标">◇</span>}</span>;
}
