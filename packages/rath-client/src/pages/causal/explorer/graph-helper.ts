import { RefObject, useEffect, useRef, MutableRefObject } from "react";
import G6, { Graph, INode } from "@antv/g6";
import { useCausalViewContext } from "../../../store/causalStore/viewStore";
import type { IFieldMeta } from "../../../interfaces";
import { GRAPH_HEIGHT, useGraphOptions, useRenderData } from "./graph-utils";


export const useReactiveGraph = (
    containerRef: RefObject<HTMLDivElement>,
    width: number,
    graphRef: MutableRefObject<Graph | undefined>,
    options: ReturnType<typeof useGraphOptions>,
    data: ReturnType<typeof useRenderData>,
    mode: "explore" | "edit",
    handleNodeClick: ((fid: string | null) => void) | undefined,
    handleEdgeClick: ((edge: { srcFid: string, tarFid: string } | null) => void) | undefined,
    fields: readonly IFieldMeta[],
    forceRelayoutFlag: 0 | 1,
    allowZoom: boolean,
) => {
    const cfgRef = useRef(options);
    cfgRef.current = options;
    const dataRef = useRef(data);
    dataRef.current = data;
    const handleNodeClickRef = useRef(handleNodeClick);
    handleNodeClickRef.current = handleNodeClick;
    const fieldsRef = useRef(fields);
    fieldsRef.current = fields;
    const handleEdgeClickRef = useRef(handleEdgeClick);
    handleEdgeClickRef.current = handleEdgeClick;

    const viewContext = useCausalViewContext();
    const { selectedFieldGroup = [] } = viewContext ?? {};

    useEffect(() => {
        const { current: container } = containerRef;
        const { current: cfg } = cfgRef;
        if (container && cfg) {
            const graph = new G6.Graph({
                ...cfg,
                container,
            });
            graph.node(node => ({
                label: node.description ?? node.id,
            }));
            graph.data(dataRef.current);
            graph.render();

            graph.on('node:click', (e: any) => {
                const nodeId = e.item._cfg.id;
                if (typeof nodeId === 'string') {
                    const idx = parseInt(nodeId, 10);
                    handleNodeClickRef.current?.(fieldsRef.current[idx].fid);
                } else {
                    handleNodeClickRef.current?.(null);
                }
            });

            graph.on('edge:click', (e: any) => {
                const edge = e.item;
                if (edge) {
                    const src = (edge._cfg?.source as any)?._cfg.id;
                    const tar = (edge._cfg?.target as any)?._cfg.id;
                    if (src && tar) {
                        const srcF = fieldsRef.current[parseInt(src, 10)];
                        const tarF = fieldsRef.current[parseInt(tar, 10)];
                        handleEdgeClickRef.current?.({ srcFid: srcF.fid, tarFid: tarF.fid });
                    } else {
                        handleEdgeClickRef.current?.(null);
                    }
                }
            });

            graphRef.current = graph;

            return () => {
                graphRef.current = undefined;
                container.innerHTML = '';
            };
        }
    }, [containerRef, graphRef]);

    useEffect(() => {
        if (graphRef.current) {
            graphRef.current.changeSize(width, GRAPH_HEIGHT);
            graphRef.current.updateLayout({
                type: 'fruchterman',
                gravity: 5,
                speed: 5,
                center: [width / 2, GRAPH_HEIGHT / 2],
                // for rendering after each iteration
                tick: () => {
                    graphRef.current?.refreshPositions();
                }
            });
            graphRef.current.render();
        }
    }, [width, graphRef]);

    useEffect(() => {
        const { current: graph } = graphRef;
        if (graph) {
            graph.data(dataRef.current);
            graph.render();
        }
    }, [forceRelayoutFlag, graphRef]);

    useEffect(() => {
        const { current: graph } = graphRef;
        if (graph) {
            graph.updateLayout(options);
            graph.refresh();
        }
    }, [options, graphRef]);

    useEffect(() => {
        const { current: container } = containerRef;
        const { current: graph } = graphRef;
        if (container && graph) {
            graph.changeData(data);
            graph.refresh();
        }
    }, [data, graphRef, containerRef]);

    useEffect(() => {
        const { current: graph } = graphRef;
        if (graph) {
            graph.setMode(`${mode}${allowZoom ? '_zoom' : ''}`);
        }
    }, [mode, graphRef, allowZoom]);

    useEffect(() => {
        const { current: graph } = graphRef;
        if (graph) {
            const focusedNodes = graph.getNodes().filter(node => {
                const fid = (() => {
                    try {
                        return fieldsRef.current[parseInt(node._cfg?.id ?? '-1', 10)].fid;
                    } catch {
                        return null;
                    }
                })();
                return fid !== null && selectedFieldGroup.some(field => field.fid === fid);
            });
            const subtreeNodes = focusedNodes.reduce<INode[]>((list, focusedNode) => {
                for (const node of graph.getNeighbors(focusedNode)) {
                    if (focusedNodes.some(item => item === node) || list.some(item => item === node)) {
                        continue;
                    }
                    list.push(node);
                }
                return list;
            }, []);
            const subtreeFidArr = subtreeNodes.map(node => {
                const idx = (() => {
                    try {
                        return parseInt(node._cfg?.id ?? '-1', 10);
                    } catch {
                        return -1;
                    }
                })();
                return fieldsRef.current[idx]?.fid;
            });
            graph.getNodes().forEach(node => {
                const isFocused = focusedNodes.some(item => item === node); // TODO: check 一下是否 work
                graph.setItemState(node, 'focused', isFocused);
                const isInSubtree = isFocused ? false : subtreeNodes.some(neighbor => neighbor === node);
                graph.setItemState(node, 'highlighted', isInSubtree);
                graph.setItemState(node, 'faded', selectedFieldGroup.length !== 0 && !isFocused && !isInSubtree);
                graph.updateItem(node, {
                    labelCfg: {
                        style: {
                            opacity: focusedNodes.length === 0 ? 1 : isFocused ? 1 : isInSubtree ? 0.5 : 0.2,
                            fontWeight: isFocused ? 600 : 400,
                        },
                    },
                });
            });
            graph.getEdges().forEach(edge => {
                const sourceIdx = (() => {
                    try {
                        return parseInt((edge._cfg?.source as any)?._cfg?.id ?? '-1', 10);
                    } catch {
                        return -1;
                    }
                })();
                const targetIdx = (() => {
                    try {
                        return parseInt((edge._cfg?.target as any)?._cfg?.id ?? '-1', 10);
                    } catch {
                        return -1;
                    }
                })();
                const nodesSelected = [
                    fieldsRef.current[sourceIdx]?.fid, fieldsRef.current[targetIdx]?.fid
                ].filter(fid => typeof fid === 'string' && selectedFieldGroup.some(f => f.fid === fid));
                const nodesInSubtree = [
                    fieldsRef.current[sourceIdx]?.fid, fieldsRef.current[targetIdx]?.fid
                ].filter(fid => typeof fid === 'string' && subtreeFidArr.some(f => f === fid));
                const isInSubtree = nodesSelected.length + nodesInSubtree.length === 2;
                graph.updateItem(edge, {
                    labelCfg: {
                        style: {
                            opacity: isInSubtree ? 1 : 0,
                        },
                    },
                });
                graph.setItemState(edge, 'highlighted', isInSubtree);
                graph.setItemState(edge, 'faded', selectedFieldGroup.length !== 0 && !isInSubtree);
            });
        }
    }, [graphRef, selectedFieldGroup]);
};
