import { NodeGroup } from 'ng-form-foundry';


export const SnssaiSchema: NodeGroup = {
  kind: 'nodeGroup',
  name: 'snssai',
  label: 'SNSSAI',
  appearance: {
    flatten: true,
  },
  children: {
    sst: { kind: 'leaf', type: 'number', name: 'sst' },
    sd: { kind: 'leaf', type: 'number', name: 'sd' },
  },
};

export const PLMNSchema: NodeGroup = {
  kind: 'nodeGroup',
  name: 'plmn',
  label: 'PLMN',
  children: {
    mcc: { kind: 'leaf', type: 'number', name: 'mcc' },
    mnc: { kind: 'leaf', type: 'number', name: 'mnc' },
    mnc_length: { kind: 'leaf', type: 'number', name: 'mnc_length' },
    snssaiList: {
      kind: 'nodeGroupList',
      name: 'snssaiList',
      type: SnssaiSchema,
    },
  },
};

export const ServingCellConfigCommonSchema: NodeGroup = {
  kind: 'nodeGroup',
  name: 'servingCellConfigCommon_item',
  label: 'Serving Cell Common',
  children: {
    physCellId: {kind: 'leaf', type: 'number', name: 'physCellId'},
    absoluteFrequencySSB: {
      kind: 'leaf',
      type: 'number',
      name: 'absoluteFrequencySSB',
    },
    dl_frequencyBand: {
      kind: 'leaf',
      type: 'number',
      name: 'dl_frequencyBand',
    },
    dl_absoluteFrequencyPointA: {
      kind: 'leaf',
      type: 'number',
      name: 'dl_absoluteFrequencyPointA',
    },
  }
}

export const simpleForm: NodeGroup = {
  kind: 'nodeGroup',
  name: 'duSimplified',
  label: 'Cell Configuration',
  root: true,
  children: {
    gNB: {
      label: 'Cell Configuration',
      name: 'gNB',
      kind: 'nodeGroup',
      appearance: {
        flatten: true,
      },
      children: {
        plmn_list: {
          kind: 'nodeGroupList', name: 'plmn_list',
          label: "PLMN", type: PLMNSchema,
        },
        servingCellConfigCommon: {
          kind: 'nodeGroupList',
          name: 'servingCellConfigCommon',
          label: 'Spectrum Configuration',
          type: ServingCellConfigCommonSchema,
        },
      }
    }
  }
}
