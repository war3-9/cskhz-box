import { describe, expect, it } from "vitest";
import { filterImportableImages } from "./importFiles";

describe("filterImportableImages", () => {
  it("keeps PNG and JPEG files and skips other folder contents", () => {
    const files = [
      new File(["png"], "unit.png", { type: "image/png" }),
      new File(["jpg"], "nested/item.JPG", { type: "image/jpeg" }),
      new File(["gif"], "animation.gif", { type: "image/gif" }),
      new File(["text"], "notes.txt", { type: "text/plain" }),
    ];

    expect(filterImportableImages(files).map((file) => file.name)).toEqual([
      "unit.png",
      "nested/item.JPG",
    ]);
  });
});
