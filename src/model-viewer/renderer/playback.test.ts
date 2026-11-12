import { describe, expect, it } from 'vitest';
import { ModelRenderer, parseMDL } from 'war3-model';
import { War3Engine } from './engine';

function engine(nonLooping: boolean) {
  const data = parseMDL(`Version { FormatVersion 800, } Model "Playback" {}
    Sequences 2 {
      Anim "Stand" { Interval { 0, 1000 }, }
      Anim "Death" { Interval { 2000, 2500 }, ${nonLooping ? 'NonLooping,' : ''} }
    }`);
  const renderer = new ModelRenderer(data);
  const result = Object.assign(Object.create(War3Engine.prototype) as War3Engine, { data, renderer });
  result.sequence(1);
  return result;
}

describe('viewer playback with the actual model renderer', () => {
  it.each([true, false])('loops across several ends regardless of NonLooping=%s', nonLooping => {
    const subject = engine(nonLooping);
    let wraps = 0, previous = subject.renderer.getFrame();
    for (let i = 0; i < 100; i++) {
      expect(subject.update(40, true)).toBe(false);
      const current = subject.renderer.getFrame();
      if (current < previous) wraps++;
      expect(subject.renderer.getSequence()).toBe(1);
      previous = current;
    }
    expect(wraps).toBeGreaterThan(5);
    expect(subject.data.Sequences[1].NonLooping).toBe(nonLooping);
  });

  it.each([true, false])('stops precisely at the end with loop off and NonLooping=%s', nonLooping => {
    const subject = engine(nonLooping);
    expect(subject.update(480, false)).toBe(false);
    expect(subject.update(80, false)).toBe(true);
    expect(subject.renderer.getFrame()).toBe(2500);
    expect(subject.update(100, false)).toBe(true);
    expect(subject.renderer.getFrame()).toBe(2500);
    expect(subject.update(40, true)).toBe(false);
    expect(subject.renderer.getFrame()).toBe(2000);
  });
});
