import produce from "immer";
import { makeAutoObservable, observable, reaction } from "mobx";
import { createContext, FC, useContext, useMemo, createElement, useEffect, useCallback } from "react";
import { Subject, withLatestFrom } from "rxjs";
import type { IFieldMeta } from "../../interfaces";
import type CausalStore from "./mainStore";


export enum NodeSelectionMode {
    NONE,
    SINGLE,
    MULTIPLE,
}

export enum ExplorationKey {
    AUTO_VIS = 'AutoVis',
    CROSS_FILTER = 'CrossFilter',
    CAUSAL_INSIGHT = 'CausalInsight',
    GRAPHIC_WALKER = 'GraphicWalker',
    PREDICT = 'predict',
}

export const ExplorationOptions = [
    { key: ExplorationKey.AUTO_VIS, text: '自动可视化' },
    { key: ExplorationKey.CROSS_FILTER, text: '因果验证' },
    { key: ExplorationKey.CAUSAL_INSIGHT, text: '可解释探索' },
    { key: ExplorationKey.GRAPHIC_WALKER, text: '可视化自助分析' },
    { key: ExplorationKey.PREDICT, text: '模型预测' },
] as const;

class CausalViewStore {

    public explorationKey = ExplorationKey.AUTO_VIS;
    public graphNodeSelectionMode = NodeSelectionMode.SINGLE;

    protected selectedFidArr$ = new Subject<readonly string[]>();
    protected _selectedNodes: readonly IFieldMeta[] = [];
    public get selectedFieldGroup() {
        return this._selectedNodes.slice(0);
    }
    public get selectedField() {
        return this._selectedNodes.at(0) ?? null;
    }

    public readonly destroy: () => void;

    constructor(causalStore: CausalStore) {
        const fields$ = new Subject<readonly IFieldMeta[]>();

        const mobxReactions = [
            reaction(() => causalStore.fields, fields => {
                fields$.next(fields);
                this.selectedFidArr$.next([]);
            }),
            reaction(() => causalStore.model.mergedPag, () => {
                this.selectedFidArr$.next([]);
            }),
            reaction(() => this.explorationKey, explorationKey => {
                switch (explorationKey) {
                    case ExplorationKey.AUTO_VIS: {
                        if (this.graphNodeSelectionMode === NodeSelectionMode.NONE) {
                            this.graphNodeSelectionMode = NodeSelectionMode.SINGLE;
                        }
                        break;
                    }
                    case ExplorationKey.CAUSAL_INSIGHT:
                    case ExplorationKey.PREDICT: {
                        this.graphNodeSelectionMode = NodeSelectionMode.SINGLE;
                        break;
                    }
                    case ExplorationKey.CROSS_FILTER: {
                        this.graphNodeSelectionMode = NodeSelectionMode.MULTIPLE;
                        break;
                    }
                    default: {
                        this.graphNodeSelectionMode = NodeSelectionMode.NONE;
                    }
                }
            }),
            reaction(() => this.graphNodeSelectionMode, graphNodeSelectionMode => {
                switch (graphNodeSelectionMode) {
                    case NodeSelectionMode.SINGLE: {
                        this._selectedNodes = this._selectedNodes.slice(this._selectedNodes.length - 1);
                        break;
                    }
                    case NodeSelectionMode.MULTIPLE: {
                        break;
                    }
                    default: {
                        this._selectedNodes = [];
                        break;
                    }
                }
            }),
        ];

        const rxReactions = [
            this.selectedFidArr$.pipe(
                withLatestFrom(fields$)
            ).subscribe(([fidArr, fields]) => {
                this._selectedNodes = fidArr.reduce<IFieldMeta[]>((nodes, fid) => {
                    const f = fields.find(which => which.fid === fid);
                    if (f) {
                        return nodes.concat([f]);
                    } else {
                        console.warn(`Select node warning: cannot find field ${fid}.`, fields);
                    }
                    return nodes;
                }, []);
            }),
        ];

        fields$.next(causalStore.fields);

        makeAutoObservable(this, {
            // @ts-expect-error non-public field
            _selectedNodes: observable.ref,
        });

        this.destroy = () => {
            mobxReactions.forEach(dispose => dispose());
            rxReactions.forEach(subscription => subscription.unsubscribe());
        };
    }

    public setExplorationKey(explorationKey: ExplorationKey) {
        this.explorationKey = explorationKey;
    }

    public setNodeSelectionMode(selectionMode: NodeSelectionMode) {
        this.graphNodeSelectionMode = selectionMode;
    }

    public toggleNodeSelected(fid: string) {
        switch (this.graphNodeSelectionMode) {
            case NodeSelectionMode.SINGLE: {
                if (this.selectedField?.fid === fid) {
                    this.selectedFidArr$.next([]);
                    return false;
                } else {
                    this.selectedFidArr$.next([fid]);
                    return true;
                }
            }
            case NodeSelectionMode.MULTIPLE: {
                const selectedFidArr = this.selectedFieldGroup.map(f => f.fid);
                this.selectedFidArr$.next(produce(selectedFidArr, draft => {
                    const matchedIndex = draft.findIndex(f => f === fid);
                    if (matchedIndex !== -1) {
                        draft.splice(matchedIndex, 1);
                    } else {
                        draft.push(fid);
                    }
                }));
                break;
            }
            default: {
                return undefined;
            }
        }
    }

    public clearSelected() {
        this.selectedFidArr$.next([]);
    }

}


const CausalViewContext = createContext<CausalViewStore | null>(null);

export const useCausalViewProvider = (causalStore: CausalStore): FC => {
    const context = useMemo(() => new CausalViewStore(causalStore), [causalStore]);

    useEffect(() => {
        const ref = context;
        return () => {
            ref.destroy();
        };
    }, [context]);

    return useCallback(function CausalViewProvider ({ children }) {
        return createElement(CausalViewContext.Provider, { value: context }, children);
    }, [context]);
};

export const useCausalViewContext = () => useContext(CausalViewContext);
