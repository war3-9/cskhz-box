fn main() {
    let vendor = std::path::PathBuf::from(std::env::var("CARGO_MANIFEST_DIR").unwrap()).join("vendor/stormlib");
    println!("cargo:rustc-link-search=native={}", vendor.display());
    println!("cargo:rustc-link-lib=static=StormLib");
    println!("cargo:rustc-link-lib=advapi32");
    println!("cargo:rustc-link-lib=user32");
    println!("cargo:rerun-if-changed=vendor/stormlib/StormLib.lib");
    println!("cargo:rerun-if-changed=icons/icon.ico");
    println!("cargo:rerun-if-changed=../.private/builtin/library.json.zlib");
    println!("cargo:rerun-if-changed=../.private/terrain-object-normalizer.tar.gz");
    println!("cargo:rerun-if-changed=../.private/terrain-object-normalizer.sha256");
    tauri_build::build()
}
