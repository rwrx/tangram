import * as chai from 'chai';
import { LayerLeaf, LayerTree, matchFeature, mergeTrees, parseLayers, groupProps, calculateDraw } from '../src/styles/layer';
import sampleLayers from './fixtures/sample-layers.json';

let assert = chai.assert;

describe('LayerLeaf', () => {

    it('returns an new instanceof', () => {
        let subject = new LayerLeaf({name: 'test', layer: {}});
        assert.instanceOf(subject, LayerLeaf);
        assert.propertyVal(subject, 'name', 'test');
    });

});

describe('LayerTree', () => {
    it('returns an new instanceof', () => {
        let subject = new LayerTree({name: 'test', layer: {}});
        assert.instanceOf(subject, LayerTree);
        assert.propertyVal(subject, 'name', 'test');
    });
});

describe('.mergeTrees()', () => {
    let subject = [
        [ { group: { a: 0.001 } }, { group: { a: 1, b: 2 } }, { group: { b: 4, c: 3 } }, { group: { d: 4 } } ],
        [ { group: { x: 3.14 } }, { group: { y: 3 } }, { group: { x: 10, z: 1 } }, { group: { w: 2 } } ],
        [ { group: { e: 'y' } }, { group: { f: 'x' } }, { group:{ g: 0.0003 } }, { group: { h: 10 } } ],
        [ { group: { s: 3.14 } }, { group: { t: 2.71828 } }, { group:{ u: 0.0001 } }, { group: { v: 'x' } } ]
    ];

    describe('when given an array of arrays to merged', () => {

        it('returns a single object', () => {
            let result = mergeTrees(subject, 'group', {});
            let compare = {
                visible: true,
                a: 1, b: 4, c: 3, d: 4,
                x: 10, y: 3, z: 1, w: 2,
                e: 'y', f: 'x', g: 0.0003, h: 10,
                s: 3.14, t: 2.71828, u: 0.0001, v: 'x'
            };
            assert.deepEqual(result, compare);
        });
    });

    describe('when given a array that is similar to real data', () => {
        const parent = {
            group: {
                "width": 10,
                "order": 1,
                "color": [1, 2, 3],
                "a": "x"
            }
        };

        const subject = [
            [
                parent,
                {
                    group: {
                        "order": 3,
                        "a": "y"
                    }
                }
            ],
            [
                parent,
                {
                    group: {
                        "b": "z",
                        "color": [7, 8, 9]
                    }
                }
            ]
        ];

        it('returns the correct object', () => {
            let result = mergeTrees(subject, 'group');
            let compare = {
                visible: true,
                width: 10,
                order: 3,
                a: 'y',
                b: 'z',
                color: [7, 8, 9]
            };
            assert.deepEqual(result, compare);
        });

    });

});

describe('.parseLayer(layers)', () => {

    describe('when given a raw LayerTree', () => {

        it('returns a LayerTree', () => {
            assert.instanceOf(parseLayers(sampleLayers), Object);
        });

        it('returns the correct number of children layers', () => {
            let tree = parseLayers(sampleLayers);
            let numChildren = Object.keys(tree.root.children_to_parse).length;
            assert.equal(numChildren, 2);
        });

    });
});


describe('.groupProps()', () => {

    describe('given an object ', () => {
        let subject = {
            draw: { group: { a: 1 } },
            filter: 'I am a filter',
            a: 'b',
            b: 'c'
        };

        it('groups the properties by white listing', () => {
            assert.deepEqual(groupProps(subject),
                [
                    {
                        draw: { group: { a: 1 } },
                        filter: 'I am a filter'
                    },
                    {
                        a: 'b',
                        b: 'c'
                    }
                ]);
        });
    });
});

describe('.calculateDraw()', () => {

    let b = {
        calculatedDraw: [
            { group: { a: true } },
            { group: { b: true } }
        ]
    };

    let c = {
        parent: b,
        draw: {
            group: {
                c: true
            }
        }
    };

    it('calculates a layers inherited draw group', () => {
        assert.deepEqual(
            calculateDraw(c),
            [{ group: { a: true } }, { group: { b: true } }, { group: { c: true } }]
        );
    });
});


describe('LayerTree.buildDrawGroups(context)', () => {
    let subject;

    beforeEach(() => {
        subject = parseLayers(
            {
                root: {
                    filter: {
                        kind: 'highway'
                    },
                    draw: {
                        group: {
                            width: 10,
                            color: [1, 2, 3]
                        }
                    },
                    fillA: {
                        filter: {
                            name: 'FDR'
                        },
                        draw: {
                            group: {
                                order: 1,
                                color: [3.14, 3.14, 3.14]
                            }
                        },
                        a: {
                            filter: {
                                name: 'FDR'
                            },
                            draw: {
                                group: {
                                    width: 20,
                                    color: [2.71828, 2.71828, 2.71828]
                                }
                            }
                        }
                    },
                    roads: {
                        filter: {
                            '$zoom': { min: 3}
                        },
                        draw: {
                            group: {
                                width: 10,
                                color: [7, 8, 9]
                            }
                        },
                        fillB: {
                            filter: {
                                id: 10
                             },
                            draw: {
                                group: {
                                    color: [10, 11, 12]
                                }
                            },
                            b: {
                                filter: {
                                    id: 10
                                },
                                draw: {
                                    group: {
                                        color: [1, 2, 3]
                                    }
                                }
                            }

                        },
                    }

                }
            }
        );
    });

    afterEach(() => {
        subject = null;
    });

    describe('when the context matches and we ask to merge the sibling layers', () => {
        let context = {
            feature: {
                properties: {
                    kind: 'highway',
                    name: 'FDR',
                    id: 10
                }
            },
            zoom: 3
        };

        it('returns a single object', () => {
            let layer = subject.root.buildDrawGroups(context);
            assert.equal(Object.keys(layer).length, 1);
            assert.deepEqual(layer.group.color, [1, 2, 3]);
            assert.equal(layer.group.width, 20);
            assert.equal(layer.group.order, 1);
        });
    });

    describe('when the feature is a highway and is named FDR', () => {
        let context = {
            feature: {
                properties: {
                    kind: 'highway',
                    name: 'FDR',
                    id: 10
                }
            },
            zoom: 3
        };

        it('returns the correct number of matching layers', () => {
            let layer = subject.root.buildDrawGroups(context);
            assert.equal(Object.keys(layer).length, 1);
            assert.deepEqual(layer.group.color, [1, 2, 3]);
            assert.equal(layer.group.width, 20);
            assert.equal(layer.group.order, 1);
        });
    });

    describe('when the feature is not a road', () => {
        let context = {
            feature: {
                properties: {
                    kind: 'aeroway'
                }
            }
        };

        it('returns undefined', () => {
            const layer = subject.root.buildDrawGroups(context);
            assert.isUndefined(layer);
        });
    });


    describe('parseLayers', () => {

        it('returns a tree', () => {
            let subject = parseLayers({
                root: {
                    filter: {
                        id: 10
                    },
                    draw: {
                        group: {
                            color: [3.14, 3.14, 3.14]
                        }
                    }
                }
            });
            assert.instanceOf(subject.root, LayerTree);
        });

        describe('when there no draw groups on the parent', () => {
            let subject = parseLayers({
                root: {
                    filter: {
                        name: 'ivan'
                    },
                    a: {
                        filter: {
                            id: 10
                        },
                        draw: {
                            group: {
                                color: [1, 2, 3]
                            }
                        }
                    }
                }
            });
            let context = {
                feature: {
                    properties: {
                        name: 'ivan',
                        id: 10
                    }
                }
            };

            it('returns only the child\'s draw', () => {
                let layer = subject.root.buildDrawGroups(context);
                assert.equal(Object.keys(layer).length, 1);
                assert.deepEqual(layer.group.color, [1, 2, 3]);
            });

        });

        describe('layer prioritization', () => {

            let context = {
                feature: {
                    properties: {
                    }
                }
            };

            describe('when layers have explicit priorities', () => {

                const priorities = {
                    root: {
                        a: {
                            priority: 2,
                            draw: { group: { value: 'a', a: true } }
                        },
                        b: {
                            priority: 1,
                            draw: { group: { value: 'b', b: true } }
                        },
                        c: {
                            priority: 3,
                            draw: { group: { value: 'c', c: true } }
                        }
                    }
                };

                it('the lowest priority value layer wins', () => {
                    let tree = parseLayers(priorities);
                    let groups = tree.root.buildDrawGroups(context);
                    assert.equal(groups.group.value, 'b');
                    assert.equal(groups.group.a, true);
                    assert.equal(groups.group.b, true);
                    assert.equal(groups.group.c, true);
                });

            });

            describe('when layers have no explicit priority', () => {

                const priorities = {
                    root: {
                        a: {
                            draw: { group: { value: 'a', a: true } }
                        },
                        b: {
                            draw: { group: { value: 'b', b: true } }
                        },
                        c: {
                            draw: { group: { value: 'c', c: true } }
                        }
                    }
                };

                it('the alphabetically sorted last layer wins', () => {
                    let tree = parseLayers(priorities);
                    let groups = tree.root.buildDrawGroups(context);
                    assert.equal(groups.group.value, 'c');
                    assert.equal(groups.group.a, true);
                    assert.equal(groups.group.b, true);
                    assert.equal(groups.group.c, true);
                });

            });

            describe('when layers have exclusivity and no priority', () => {

                const priorities = {
                    root: {
                        a: {
                            exclusive: true,
                            draw: { group: { value: 'a', a: true } }
                        },
                        b: {
                            exclusive: true,
                            draw: { group: { value: 'b', b: true } }
                        },
                        c: {
                            draw: { group: { value: 'c', c: true } }
                        }
                    }
                };

                it('the alphabetically sorted last exclusive layer wins', () => {
                    let tree = parseLayers(priorities);
                    let groups = tree.root.buildDrawGroups(context);
                    assert.equal(groups.group.value, 'b');
                    assert.equal(groups.group.a, null);
                    assert.equal(groups.group.b, true);
                    assert.equal(groups.group.c, null);
                });

            });

            describe('when layers have exclusivity and priority', () => {

                const priorities = {
                    root: {
                        a: {
                            exclusive: true,
                            priority: 1,
                            draw: { group: { value: 'a', a: true } }
                        },
                        b: {
                            draw: { group: { value: 'b', b: true } }
                        },
                        c: {
                            exclusive: true,
                            draw: { group: { value: 'c', c: true } }
                        }
                    }
                };

                it('the lowest priority value exclusive layer wins', () => {
                    let tree = parseLayers(priorities);
                    let groups = tree.root.buildDrawGroups(context);
                    assert.equal(groups.group.value, 'a');
                    assert.equal(groups.group.a, true);
                    assert.equal(groups.group.b, null);
                    assert.equal(groups.group.c, null);
                });

            });

        });

    });

});

describe('matchFeature() with many sibling layers (indexed by a feature property)', () => {
    // The matching before the index: each sibling layer is checked
    function matchEachLayer(context, layers, collected_layers, collected_layers_ids) {
        let matched = false;
        for (const current of layers) {
            if (current.doesMatch(context)) {
                matched = true;
                if (current.is_tree && matchEachLayer(context, current.layers, collected_layers, collected_layers_ids)) {
                    if (current.exclusive) {
                        break;
                    }
                    continue;
                }
                collected_layers.push(current);
                collected_layers_ids.push(current.id);
                if (current.exclusive) {
                    break;
                }
            }
        }
        return matched;
    }

    const kinds = ['peak', 'saddle', 'spring', 'cafe', 'bench', 'hut', 'shelter', 'viewpoint'];
    const sublayers = {};
    kinds.forEach((kind, i) => {
        sublayers[`${kind}_layer`] = { filter: { kind, $zoom: { min: i % 3 } }, draw: { points: { order: i } } };
    });
    Object.assign(sublayers, {
        several_kinds: { filter: { kind: ['peak', 'hut', 'peak'] }, draw: { points: { order: 20 } } }, // listed twice
        kind_and_name: { filter: { kind: 'cafe', name: 'Chata' }, draw: { points: { order: 21 } } },
        any_kind: { filter: { name: 'Chata' }, draw: { points: { order: 22 } } },
        no_filter: { draw: { points: { order: 23 } } },
        function_filter: { filter: 'function() { return feature.ele > 2000; }', draw: { points: { order: 24 } } },
        number_kind: { filter: { kind: 5 }, draw: { points: { order: 25 } } },
        disabled: { enabled: false, filter: { kind: 'peak' }, draw: { points: { order: 26 } } },
        exclusive_spring: { exclusive: true, priority: 1, filter: { kind: 'spring' }, draw: { points: { order: 27 } } },
        nested: {
            filter: { kind: ['bench', 'viewpoint'] },
            draw: { points: { order: 28 } },
            named: { filter: { name: 'Chata' }, draw: { points: { order: 29 } } }
        }
    });

    const features = [];
    for (const kind of [...kinds, 'unknown', 5, '5', null, undefined, NaN]) {
        for (const name of ['Chata', 'Other', undefined]) {
            for (const ele of [1000, 2500]) {
                features.push({ properties: { kind, name, ele } });
            }
        }
    }

    it('matches the same layers, in the same order, as checking each layer', () => {
        // (each tree from its own copy: building a layer modifies its filter)
        const config = () => ({ pois: Object.assign({ data: { source: 'osm' } }, JSON.parse(JSON.stringify(sublayers))) });
        const tree = parseLayers(config()).pois;
        const reference = parseLayers(config()).pois;

        for (const zoom of [0, 1, 2, 5]) {
            // twice: the index is created once the layers are built, during the first round
            for (let round = 0; round < 2; round++) {
                for (const feature of features) {
                    const context = { feature, zoom };
                    const layers = [], ids = [], reference_layers = [], reference_ids = [];
                    matchFeature(context, [tree], layers, ids);
                    matchEachLayer(context, [reference], reference_layers, reference_ids);
                    assert.deepEqual(layers.map(l => l.full_name), reference_layers.map(l => l.full_name),
                        `zoom ${zoom}, ${JSON.stringify(feature.properties)}`);
                }
            }
        }
    });
});
