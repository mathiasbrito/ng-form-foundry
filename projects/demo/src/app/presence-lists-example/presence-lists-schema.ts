import { NodeGroup } from 'ng-form-foundry';

/**
 * A gNB-shaped schema exercising optional (presence) lists — the byte-exact
 * injection fix. `amf_ip_address` (leaf-list) and `plmn_list` (node-group-list)
 * are `presence: true`: absent until toggled on, and an absent list is kept
 * distinct from a present-but-empty one. `served_cells` is an ordinary
 * (non-presence) list for contrast — always present, shown by default.
 */
export const presenceListsForm: NodeGroup = {
  kind: 'nodeGroup',
  name: 'gNB',
  label: 'gNB',
  root: true,
  children: {
    gNB_ID: { kind: 'leaf', type: 'number', name: 'gNB_ID', label: 'gNB ID' },

    // Optional (advisoryRequired) leaf-list: starts absent. "Add AMF IP
    // addresses" makes the first entry appear at once; removing the last entry
    // de-materializes the whole list (→ absent).
    amf_ip_address: {
      kind: 'leafList',
      type: 'string',
      name: 'amf_ip_address',
      label: 'AMF IP addresses',
      presence: true,
    },

    // Required (non-presence) leaf-list: always present. It has no "remove list"
    // — when empty it stays `[]`, with an "Add TAC item" affordance.
    tac_list: {
      kind: 'leafList',
      type: 'number',
      name: 'tac_list',
      label: 'TAC',
    },

    // Optional node-group-list: same presence semantics for a list of objects.
    plmn_list: {
      kind: 'nodeGroupList',
      name: 'plmn_list',
      label: 'PLMN list',
      presence: true,
      type: {
        kind: 'nodeGroup',
        name: 'plmn',
        label: 'PLMN',
        appearance: { flatten: true },
        children: {
          mcc: { kind: 'leaf', type: 'number', name: 'mcc', label: 'MCC' },
          mnc: { kind: 'leaf', type: 'number', name: 'mnc', label: 'MNC' },
        },
      },
    },

    // Ordinary (non-presence) list: always present (it has no "remove list"
    // affordance — the key is mandatory). `minItems: 1` keeps at least one cell,
    // so it never drops to a confusing empty-but-unremovable state.
    served_cells: {
      kind: 'nodeGroupList',
      name: 'served_cells',
      label: 'Served cells',
      minItems: 1,
      type: {
        kind: 'nodeGroup',
        name: 'cell',
        label: 'Cell',
        appearance: { flatten: true },
        children: {
          cell_id: { kind: 'leaf', type: 'number', name: 'cell_id', label: 'Cell ID' },
        },
      },
    },
  },
};

/**
 * Initial value the operator "loaded": only `gNB_ID` and one served cell. The
 * two optional lists are absent — a faithful round-trip must not invent them.
 */
export const presenceListsInitial = {
  gNB_ID: 3584,
  served_cells: [{ cell_id: 1 }],
};
