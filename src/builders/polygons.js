// Polygon builders
import Geo from '../utils/geo';
import { default_uvs, outsideTile } from './common';

import earcut from 'earcut';
import quickselect from 'quickselect';


/**
 * To tesselate flat 2D polygons.
 * The x & y coordinates will be set as first two elements of provided vertex_template.
 * @param {Array.<Array.<Array.<Array.<number>>>>} polygons The polygons to tesselate.
 * @param {VertexData} vertex_data The VertexData were to store the results
 * @param {Array.<number>} vertex_template The vertex template to use
 * @param {Object} options The texture coordinate options to apply
 * @return {number} the number of the resulting geometries (triangles)
 */
export function buildPolygons (
    polygons, vertex_data, vertex_template, { texcoord_index, texcoord_scale, texcoord_normalize }) {

    let vertex_elements = vertex_data.vertex_elements,
        num_polygons = polygons.length,
        geom_count = 0,
        min_u, min_v, max_u, max_v,
        min_x, min_y, max_x, max_y,
        span_x, span_y, scale_u, scale_v;

    if (texcoord_index) {
        texcoord_normalize = texcoord_normalize || 1;
        [min_u, min_v, max_u, max_v] = texcoord_scale || default_uvs;
    }

    for (let p = 0; p < num_polygons; p++) {

        const max_rings = 500;
        let polygon = polygons[p];

        if (polygon.length > max_rings) {
            polygon = [...polygon]; // copy to avoid modifying original
            quickselect(polygon, max_rings, 1, polygon.length - 1, (a, b) => b.area - a.area);
            polygon = polygon.slice(0, max_rings);
        }

        const indices = triangulatePolygon(earcut.flatten(polygon));
        const num_indices = indices.length;
        const element_offset = vertex_data.vertex_count;

        // The vertices and vertex-elements must not be added if earcut returns no indices:
        if (num_indices) {

            // Find polygon extents to calculate UVs, fit them to the axis-aligned bounding box:
            if (texcoord_index) {
                [min_x, min_y, max_x, max_y] = Geo.findBoundingBox(polygon),
                span_x = max_x - min_x,
                span_y = max_y - min_y,
                scale_u = (max_u - min_u) / span_x,
                scale_v = (max_v - min_v) / span_y;
            }

            for (let ring_index = 0; ring_index < polygon.length; ring_index++) {
                // Add vertex data:
                let polygon_ring = polygon[ring_index];
                for (let i = 0; i < polygon_ring.length; i++) {
                    let vertex = polygon_ring[i];
                    vertex_template[0] = vertex[0];
                    vertex_template[1] = vertex[1];

                    // Add UVs:
                    if (texcoord_index) {
                        vertex_template[texcoord_index + 0] = ((vertex[0] - min_x) * scale_u + min_u) * texcoord_normalize;
                        vertex_template[texcoord_index + 1] = ((vertex[1] - min_y) * scale_v + min_v) * texcoord_normalize;
                    }

                    vertex_data.addVertex(vertex_template);
                }
            }

            // Add element indices:
            for (let i = 0; i < num_indices; i++) {
                vertex_elements.push(element_offset + indices[i]);
            }
            geom_count += num_indices / 3;

        }
    }
    return geom_count;
}


// Tesselate and extrude a flat 2D polygon into a simple 3D model with fixed height and add to GL vertex buffer
export function buildExtrudedPolygons (
    polygons,
    z, height, min_height,
    vertex_data, vertex_template,
    normal_index,
    normal_normalize,
    {
        remove_tile_edges,
        tile_edge_tolerance,
        texcoord_index,
        texcoord_scale,
        texcoord_normalize,
        winding
    }) {

    // Top
    var min_z = z + (min_height || 0);
    var max_z = z + height;
    vertex_template[2] = max_z;
    var geom_count = buildPolygons(polygons, vertex_data, vertex_template, { texcoord_index, texcoord_scale, texcoord_normalize });

    var vertex_elements = vertex_data.vertex_elements;
    var element_offset = vertex_data.vertex_count;

    // Walls
    // Fit UVs to wall quad
    if (texcoord_index) {
        texcoord_normalize = texcoord_normalize || 1;
        var [min_u, min_v, max_u, max_v] = texcoord_scale || default_uvs;
        var texcoords = [
            [min_u, max_v],
            [min_u, min_v],
            [max_u, min_v],
            [max_u, max_v]
        ];
    }

    var num_polygons = polygons.length;
    for (var p=0; p < num_polygons; p++) {
        var polygon = polygons[p];

        for (var q=0; q < polygon.length; q++) {
            var contour = polygon[q];

            for (var w=0; w < contour.length - 1; w++) {
                if (remove_tile_edges && outsideTile(contour[w], contour[w+1], tile_edge_tolerance)) {
                    continue; // don't extrude tile edges
                }

                // Wall order is dependent on winding order, so that normals face outward
                let w0, w1;
                if (winding === 'CCW') {
                    w0 = w;
                    w1 = w+1;
                }
                else {
                    w0 = w+1;
                    w1 = w;
                }

                // Calc the normal of the wall from up vector and one segment of the wall triangles
                // (inlined normalize + cross product with up vector, to avoid allocations)
                let x0 = contour[w0][0], y0 = contour[w0][1];
                let x1 = contour[w1][0], y1 = contour[w1][1];
                let wall_x = x1 - x0, wall_y = y1 - y0;
                let wall_len = wall_x * wall_x + wall_y * wall_y;
                if (wall_len !== 1) {
                    wall_len = Math.sqrt(wall_len);
                    if (wall_len !== 0) {
                        wall_x /= wall_len;
                        wall_y /= wall_len;
                    }
                    else {
                        wall_x = 0;
                        wall_y = 0;
                    }
                }

                // Update vertex template with current surface normal
                vertex_template[normal_index + 0] = (0 - wall_y) * normal_normalize;
                vertex_template[normal_index + 1] = wall_x * normal_normalize;
                vertex_template[normal_index + 2] = 0;

                // Two triangles for the quad formed by each vertex pair, going from bottom to top height
                for (var wv=0; wv < 4; wv++) {
                    vertex_template[0] = (wv < 2) ? x1 : x0;
                    vertex_template[1] = (wv < 2) ? y1 : y0;
                    vertex_template[2] = (wv === 0 || wv === 3) ? max_z : min_z;

                    if (texcoord_index) {
                        vertex_template[texcoord_index + 0] = texcoords[wv][0] * texcoord_normalize;
                        vertex_template[texcoord_index + 1] = texcoords[wv][1] * texcoord_normalize;
                    }

                    vertex_data.addVertex(vertex_template);
                }

                vertex_elements.push(element_offset + 0);
                vertex_elements.push(element_offset + 1);
                vertex_elements.push(element_offset + 2);
                vertex_elements.push(element_offset + 2);
                vertex_elements.push(element_offset + 3);
                vertex_elements.push(element_offset + 0);

                element_offset += 4;
                geom_count += 2;
            }
        }
    }
    return geom_count;
}

// Triangulation using earcut
// https://github.com/mapbox/earcut
export function triangulatePolygon (data) {
    return earcut(data.vertices, data.holes, data.dimensions);
}
