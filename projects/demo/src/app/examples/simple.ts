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
      maxItems: 4,
      minItems: 1,
      type: SnssaiSchema,
    },
  },
};

export const ServingCellConfigCommonSchema: NodeGroup = {
  kind: 'nodeGroup',
  name: 'servingCellConfigCommon_item',
  label: 'Spectrum Configuration',
  children: {
    absoluteFrequencySSB: {
      kind: 'leaf',
      type: 'number',
      name: 'absoluteFrequencySSB',
      label: 'Absolute Frequency SSB'
    },
    dl_frequencyBand: {
      kind: 'leaf',
      type: 'number',
      name: 'dl_frequencyBand',
      label: 'DL Frequency Band'
    },
    dl_absoluteFrequencyPointA: {
      kind: 'leaf',
      type: 'number',
      name: 'dl_absoluteFrequencyPointA',
      label: 'DL Absolute Frequency Point A'
    },
    dl_carrierBandwidth: {
      kind: 'leaf',
      type: 'number',
      name: 'dl_carrierBandwidth',
      label: 'Carrier Bandwidth (PRBs)'
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
          kind: 'nodeGroupList',
          name: 'plmn_list',
          label: "PLMN",
          type: PLMNSchema,
        },
        servingCellConfigCommon: {
          kind: 'nodeGroupList',
          name: 'servingCellConfigCommon',
          label: 'Spectrum Configuration',
          maxItems: 1,
          minItems: 1,
          type: ServingCellConfigCommonSchema,
        },
      }
    }
  }
}


// const KEYMAP = {
//   mcc: ['mcc'],
//   mnc: ['mnc'],
//   sst: ['sst'],
//   sd: ['sd'],
//   absoluteFrequencySSB: [
//     'absoluteFrequencySSB',
//     'ssb_absolute_frequency',
//     'arfcn_ssb',
//   ],
//   band: ['band', 'nr_band', 'frequencyBand', 'dl_frequencyBand'],
//   carrierBandwidthPRB: [
//     'carrierBandwidthPRB',
//     'N_RB_DL',
//     'carrier_bw_prb',
//     'dl_nrbs',
//     'dl_carrierBandwidth',
//     'carrierBandwidth',
//   ],
//   absoluteFrequencyPointA: [
//     'absoluteFrequencyPointA',
//     'dl_absoluteFrequencyPointA',
//     'arfcn_point_a',
//   ],
//   amfIpAddress: ['amfIpAddress', 'amf_ip_address', 'amf_ip_addr'],
//   ngAmfIpCidr: ['ngAmfIpCidr', 'GNB_IPV4_ADDRESS_FOR_NG_AMF', 'ng_amf_ip_cidr'],
//   nguIpCidr: ['nguIpCidr', 'GNB_IPV4_ADDRESS_FOR_NGU', 'ngu_ip_cidr'],
//   puschTargetSNRx10: ['puschTargetSNRx10', 'pusch_TargetSNRx10'],
//   pucchTargetSNRx10: ['pucchTargetSNRx10', 'pucch_TargetSNRx10'],
//   ulMaxMcs: ['ulMaxMcs', 'ul_max_mcs'],
//   dlSlots: ['dlSlots', 'nrofDownlinkSlots', 'tdd_dl_slots'],
//   dlSymbols: ['dlSymbols', 'nrofDownlinkSymbols', 'tdd_dl_symbols'],
//   ulSlots: ['ulSlots', 'nrofUplinkSlots', 'tdd_ul_slots'],
// } as const;
