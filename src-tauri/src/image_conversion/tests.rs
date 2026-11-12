use super::*;

fn fixture() -> PathBuf {
    let root = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../test-results/image-conversion-rust").join(uuid::Uuid::new_v4().to_string());
    fs::create_dir_all(&root).unwrap();
    root
}

#[test]
fn scans_single_files_and_current_folder_without_touching_sources() {
    let root = fixture();
    let result = (|| {
        for name in ["中文图标.BLP", "透明.tga", "icon.png", "照片.JPG", "兼容.jpeg", "other.txt"] {
            fs::write(root.join(name), name.as_bytes()).unwrap();
        }
        fs::create_dir_all(root.join("转换图片")).unwrap();
        fs::write(root.join("转换图片/旧结果.png"), b"keep").unwrap();
        fs::create_dir(root.join("child")).unwrap();
        fs::write(root.join("child/inside.png"), b"nested").unwrap();
        let folder = scan(root.to_str().unwrap()).unwrap();
        assert_eq!(folder.files.len(), 5);
        assert!(folder.files.iter().all(|file| Path::new(&file.path).parent() == Some(Path::new(&folder.directory))));
        assert_eq!(folder.output_directory, display_path(&root.canonicalize().unwrap().join("转换图片")));
        let single = scan(root.join("中文图标.BLP").to_str().unwrap()).unwrap();
        assert_eq!(single.files.len(), 1);
        assert_eq!(single.files[0].name, "中文图标.BLP");
        assert_eq!(read_image(&single.files[0].path).unwrap(), "中文图标.BLP".as_bytes());
        assert_eq!(single.output_directory, folder.output_directory);
        assert!(scan(root.join("other.txt").to_str().unwrap()).is_err());
        assert!(read_image(root.join("other.txt").to_str().unwrap()).is_err());
        assert!(scan("relative.png").is_err());
        assert!(read_image("relative.png").is_err());
        assert_eq!(fs::read(root.join("转换图片/旧结果.png")).unwrap(), b"keep");
    })();
    fs::remove_dir_all(root).unwrap(); result
}

#[test]
fn rejects_oversized_missing_and_non_image_sources() {
    let root = fixture();
    let result = (|| {
        let large = root.join("large.png");
        fs::File::create(&large).unwrap().set_len(MAX_IMAGE_BYTES + 1).unwrap();
        assert!(read_image(large.to_str().unwrap()).unwrap_err().contains("128 MB"));
        assert!(read_image(root.join("missing.blp").to_str().unwrap()).is_err());
        assert!(read_image(root.to_str().unwrap()).is_err());
        assert!(output_path(root.to_str().unwrap()).is_err());
        assert!(output_path(root.join("转换图片").to_str().unwrap()).is_err());
        assert!(scan(root.to_str().unwrap()).unwrap().files.len() == 1);
    })();
    fs::remove_dir_all(root).unwrap(); result
}

#[test]
fn creates_conversion_folder_and_avoids_overwriting_inputs_or_previous_outputs() {
    let root = fixture();
    let result = (|| {
        fs::write(root.join("图标.png"), b"source").unwrap();
        let source = scan(root.join("图标.png").to_str().unwrap()).unwrap();
        assert!(!root.join("转换图片").exists());
        for (data, expected) in [(vec![1, 2], "图标.png"), (vec![3, 4], "图标 (2).png")] {
            let name = crate::batch::write_batch_image(source.directory.clone(), "图标.png".into(), data.clone(), Some("转换图片".into())).unwrap();
            assert_eq!(name, expected);
            assert_eq!(fs::read(root.join("转换图片").join(expected)).unwrap(), data);
        }
        assert_eq!(fs::read(root.join("图标.png")).unwrap(), b"source");
        assert_eq!(output_path(&source.output_directory).unwrap(), root.join("转换图片").canonicalize().unwrap());
    })();
    fs::remove_dir_all(root).unwrap(); result
}
