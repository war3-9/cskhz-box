import { describe, expect, it } from 'vitest';
import { clampCaptureFrame, defaultCaptureFrame, dragResizeCaptureFrame, resizeCaptureFrame } from './captureFrame';

describe('model capture frame', () => {
  it('starts near the reference image crop and clamps movement to the preview', () => {
    expect(defaultCaptureFrame).toEqual({ x: .15, y: .05, width: .7, height: .9 });
    expect(clampCaptureFrame({ ...defaultCaptureFrame, x: .8, y: .8 })).toEqual({ x: .30000000000000004, y: .09999999999999998, width: .7, height: .9 });
  });

  it('resizes around the center and keeps a minimum crop size', () => {
    const resized = resizeCaptureFrame(defaultCaptureFrame, .5, .6);
    expect(resized.x).toBeCloseTo(.25);
    expect(resized.y).toBeCloseTo(.2);
    expect(resized.width).toBe(.5);
    expect(resized.height).toBe(.6);
    const minimum = resizeCaptureFrame(defaultCaptureFrame, .05, .05);
    expect(minimum.x).toBeCloseTo(.4);
    expect(minimum.y).toBeCloseTo(.4);
    expect(minimum.width).toBe(.2);
    expect(minimum.height).toBe(.2);
  });

  it('keeps the top left corner fixed when a resize reaches the preview edge', () => {
    const frame = { x: .4, y: .3, width: .4, height: .5 };
    expect(dragResizeCaptureFrame(frame, 1, 1)).toEqual({ x: .4, y: .3, width: .6, height: .7 });
  });
});
