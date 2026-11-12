// Exact separable squared Euclidean distance transform (Felzenszwalb/Huttenlocher).
// https://cs.brown.edu/people/pfelzens/dt/
export function distanceField(
  alpha: Uint8Array,
  width: number,
  height: number,
  inside: boolean,
) {
  const distances = new Float32Array(alpha.length);
  for (let i = 0; i < alpha.length; i++)
    distances[i] = alpha[i] > 0 === inside ? 0 : 1e15;
  const length = Math.max(width, height);
  const input = new Float64Array(length);
  const output = new Float64Array(length);
  const sites = new Int32Array(length);
  const boundaries = new Float64Array(length + 1);
  const transform = (count: number) => {
    let k = 0;
    sites[0] = 0;
    boundaries[0] = -Infinity;
    boundaries[1] = Infinity;
    for (let q = 1; q < count; q++) {
      let separation: number;
      do {
        const p = sites[k];
        separation = (input[q] + q * q - input[p] - p * p) / (2 * (q - p));
        if (separation > boundaries[k]) break;
        k--;
      } while (k >= 0);
      k++;
      sites[k] = q;
      boundaries[k] = separation;
      boundaries[k + 1] = Infinity;
    }
    k = 0;
    for (let q = 0; q < count; q++) {
      while (boundaries[k + 1] < q) k++;
      const delta = q - sites[k];
      output[q] = delta * delta + input[sites[k]];
    }
  };
  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) input[y] = distances[y * width + x];
    transform(height);
    for (let y = 0; y < height; y++) distances[y * width + x] = output[y];
  }
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) input[x] = distances[y * width + x];
    transform(width);
    for (let x = 0; x < width; x++)
      distances[y * width + x] = Math.sqrt(output[x]);
  }
  return distances;
}
