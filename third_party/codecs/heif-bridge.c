/* Collage Studio HEIC bridge. Distributed under the application's MIT license.
 * libheif and libde265 retain their separate LGPL-3.0-or-later licenses.
 */
#include <stdlib.h>
#include <stdint.h>
#include <emscripten.h>
#include <libheif/heif.h>

struct decoded_image {
    struct heif_context *context;
    struct heif_image_handle *handle;
    struct heif_image *image;
};

EMSCRIPTEN_KEEPALIVE void collage_heif_free(struct decoded_image *decoded) {
    if (!decoded) return;
    if (decoded->image) heif_image_release(decoded->image);
    if (decoded->handle) heif_image_handle_release(decoded->handle);
    if (decoded->context) heif_context_free(decoded->context);
    free(decoded);
}

/* Deliberately use the first top-level image, matching the application's previous
 * multi-image import behavior. libheif applies HEIF orientation transforms. */
EMSCRIPTEN_KEEPALIVE struct decoded_image *collage_heif_decode(const uint8_t *data, size_t size) {
    struct decoded_image *decoded = calloc(1, sizeof(*decoded));
    if (!decoded) return NULL;
    decoded->context = heif_context_alloc();
    if (!decoded->context) goto fail;
    if (heif_context_read_from_memory_without_copy(decoded->context, data, size, NULL).code) goto fail;
    heif_item_id first;
    if (heif_context_get_list_of_top_level_image_IDs(decoded->context, &first, 1) != 1) goto fail;
    if (heif_context_get_image_handle(decoded->context, first, &decoded->handle).code) goto fail;
    int width = heif_image_handle_get_width(decoded->handle);
    int height = heif_image_handle_get_height(decoded->handle);
    if (width <= 0 || height <= 0 || (uint64_t)width * height > 60000000) goto fail;
    if (heif_decode_image(decoded->handle, &decoded->image, heif_colorspace_RGB,
                          heif_chroma_interleaved_RGBA, NULL).code) goto fail;
    return decoded;
fail:
    collage_heif_free(decoded);
    return NULL;
}
EMSCRIPTEN_KEEPALIVE int collage_heif_width(struct decoded_image *decoded) {
    return heif_image_get_width(decoded->image, heif_channel_interleaved);
}
EMSCRIPTEN_KEEPALIVE int collage_heif_height(struct decoded_image *decoded) {
    return heif_image_get_height(decoded->image, heif_channel_interleaved);
}
EMSCRIPTEN_KEEPALIVE int collage_heif_stride(struct decoded_image *decoded) {
    int stride;
    heif_image_get_plane_readonly(decoded->image, heif_channel_interleaved, &stride);
    return stride;
}
EMSCRIPTEN_KEEPALIVE const uint8_t *collage_heif_pixels(struct decoded_image *decoded) {
    int stride;
    return heif_image_get_plane_readonly(decoded->image, heif_channel_interleaved, &stride);
}
