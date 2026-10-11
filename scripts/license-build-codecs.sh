#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CODECS="$ROOT/third_party/codecs"
WORK="$CODECS/.work"
JOBS="${CODEC_BUILD_JOBS:-2}"
mkdir -p "$WORK" "$CODECS/generated" "$CODECS/aac/build" "$CODECS/relink"
if [[ ! -f "$WORK/emsdk/emsdk_env.sh" ]]; then
  mkdir -p "$WORK/emsdk"
  tar -xf "$CODECS/sources/emsdk-4.0.9.tar.gz" -C "$WORK/emsdk" --strip-components=1
fi
if [[ ! -x "$WORK/emsdk/upstream/emscripten/emcc" ]]; then
  EMSDK_KEEP_DOWNLOADS=1 "$WORK/emsdk/emsdk" install 4.0.9
fi
"$WORK/emsdk/emsdk" activate 4.0.9
source "$WORK/emsdk/emsdk_env.sh"
for spec in libheif-1.19.8 libde265-1.0.16 ffmpeg-7.1.1; do
  # Never compile unrecorded edits from a previous scratch directory.
  rm -rf "$WORK/$spec"
  mkdir -p "$WORK/$spec"
  archive="$CODECS/sources/$spec.tar.gz"
  [[ "$spec" == ffmpeg-* ]] && archive="$CODECS/sources/$spec.tar.xz"
  tar -xf "$archive" -C "$WORK/$spec" --strip-components=1
  for change in "$CODECS/patches/$spec/"*.patch; do
    [[ -f "$change" ]] || continue
    patch --batch -d "$WORK/$spec" -p1 < "$change"
  done
done
DE265="$WORK/libde265-1.0.16"
HEIF="$WORK/libheif-1.19.8"
FFMPEG="$WORK/ffmpeg-7.1.1"
cd "$DE265"
[[ -x configure ]] || ./autogen.sh
CXXFLAGS='-O3' emconfigure ./configure --host=wasm32-unknown-emscripten --enable-static --disable-shared --disable-sse --disable-dec265 --disable-sherlock265
emmake make -j"$JOBS"
HEIF_BUILD="$WORK/heif-build"
rm -rf "$HEIF_BUILD"
emcmake cmake -S "$HEIF" -B "$HEIF_BUILD" \
  -DCMAKE_BUILD_TYPE=Release -DBUILD_SHARED_LIBS=OFF -DBUILD_TESTING=OFF \
  -DWITH_EXAMPLES=OFF -DWITH_GDK_PIXBUF=OFF -DENABLE_PLUGIN_LOADING=OFF \
  -DENABLE_MULTITHREADING_SUPPORT=OFF -DENABLE_PARALLEL_TILE_DECODING=OFF \
  -DWITH_LIBDE265=ON -DWITH_LIBDE265_PLUGIN=OFF \
  -DLIBDE265_INCLUDE_DIR="$DE265" -DLIBDE265_LIBRARY="$DE265/libde265/.libs/libde265.a" \
  -DWITH_X265=OFF -DWITH_KVAZAAR=OFF -DWITH_UVG266=OFF -DWITH_VVDEC=OFF -DWITH_VVENC=OFF \
  -DWITH_OpenH264_DECODER=OFF -DWITH_DAV1D=OFF -DWITH_AOM_DECODER=OFF -DWITH_AOM_ENCODER=OFF \
  -DWITH_SvtEnc=OFF -DWITH_RAV1E=OFF -DWITH_JPEG_DECODER=OFF -DWITH_JPEG_ENCODER=OFF \
  -DWITH_OpenJPEG_ENCODER=OFF -DWITH_OpenJPEG_DECODER=OFF -DWITH_FFMPEG_DECODER=OFF \
  -DWITH_OPENJPH_ENCODER=OFF -DWITH_UNCOMPRESSED_CODEC=OFF -DWITH_HEADER_COMPRESSION=OFF \
  -DWITH_LIBSHARPYUV=OFF
emmake cmake --build "$HEIF_BUILD" --parallel "$JOBS"
emcc -O3 -I"$HEIF/libheif/api" -I"$HEIF_BUILD" -c "$CODECS/heif-bridge.c" -o "$CODECS/relink/heif-bridge.o"
em++ "$CODECS/relink/heif-bridge.o" "$HEIF_BUILD/libheif/libheif.a" "$DE265/libde265/.libs/libde265.a" \
  -O3 -sMODULARIZE=1 -sEXPORT_ES6=1 -sSINGLE_FILE=1 -sALLOW_MEMORY_GROWTH=1 \
  -sENVIRONMENT=web,worker -sFILESYSTEM=0 -sMALLOC=emmalloc -sDYNAMIC_EXECUTION=0 -sEXPORTED_RUNTIME_METHODS=HEAPU8 \
  '-sEXPORTED_FUNCTIONS=["_malloc","_free","_collage_heif_decode","_collage_heif_free","_collage_heif_width","_collage_heif_height","_collage_heif_stride","_collage_heif_pixels"]' \
  -o "$CODECS/generated/heif.js"
cd "$FFMPEG"
emconfigure ./configure --target-os=none --arch=x86_32 --enable-cross-compile \
  --disable-asm --disable-x86asm --disable-inline-asm --disable-programs --disable-doc --disable-debug \
  --disable-all --disable-everything --disable-autodetect --disable-pthreads --disable-runtime-cpudetect \
  --disable-gpl --disable-nonfree --enable-avcodec --enable-encoder=aac \
  --cc=emcc --cxx=em++ --ar=emar --ranlib=emranlib \
  --extra-cflags='-DNDEBUG -Oz -flto -msimd128' --extra-ldflags='-Oz -flto'
emmake make -j"$JOBS"
emcc -I"$FFMPEG" -msimd128 -flto -Oz -c "$CODECS/aac/src/bridge.c" -o "$CODECS/relink/aac-bridge.o"
emcc "$CODECS/relink/aac-bridge.o" "$FFMPEG/libavcodec/libavcodec.a" "$FFMPEG/libavutil/libavutil.a" \
  -sMODULARIZE=1 -sEXPORT_ES6=1 -sSINGLE_FILE=1 -sALLOW_MEMORY_GROWTH=1 \
  -sENVIRONMENT=web,worker -sFILESYSTEM=0 -sMALLOC=emmalloc -sSUPPORT_LONGJMP=0 \
  -sEXPORTED_RUNTIME_METHODS=cwrap,HEAPU8 -sEXPORTED_FUNCTIONS=_malloc,_free \
  -msimd128 -flto -Oz -o "$CODECS/aac/build/aac.js"
cp "$HEIF_BUILD/libheif/libheif.a" "$CODECS/relink/libheif.a"
cp "$DE265/libde265/.libs/libde265.a" "$CODECS/relink/libde265.a"
cp "$FFMPEG/libavcodec/libavcodec.a" "$CODECS/relink/libavcodec.a"
cp "$FFMPEG/libavutil/libavutil.a" "$CODECS/relink/libavutil.a"
emcc --version
