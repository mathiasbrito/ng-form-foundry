import { NodeGroup } from '../dynamic-recursive.types';

export const SnssaiSchema: NodeGroup = {
  kind: 'nodeGroup',
  name: 'snssai',
  label: 'SNSSAI',
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

export const SCTPSchema: NodeGroup = {
  kind: 'nodeGroup',
  name: 'SCTP',
  children: {
    SCTP_INSTREAMS: { kind: 'leaf', type: 'number', name: 'SCTP_INSTREAMS' },
    SCTP_OUTSTREAMS: { kind: 'leaf', type: 'number', name: 'SCTP_OUTSTREAMS' },
  },
};

export const ServingCellConfigCommonSchema: NodeGroup = {
  kind: 'nodeGroup',
  name: 'servingCellConfigCommon_item',
  label: 'Serving Cell Common',
  children: {
    physCellId: { kind: 'leaf', type: 'number', name: 'physCellId' },
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
    dl_offstToCarrier: {
      kind: 'leaf',
      type: 'number',
      name: 'dl_offstToCarrier',
    },
    dl_subcarrierSpacing: {
      kind: 'leaf',
      type: 'number',
      name: 'dl_subcarrierSpacing',
    },
    dl_carrierBandwidth: {
      kind: 'leaf',
      type: 'number',
      name: 'dl_carrierBandwidth',
    },
    initialDLBWPlocationAndBandwidth: {
      kind: 'leaf',
      type: 'number',
      name: 'initialDLBWPlocationAndBandwidth',
    },
    initialDLBWPsubcarrierSpacing: {
      kind: 'leaf',
      type: 'number',
      name: 'initialDLBWPsubcarrierSpacing',
    },
    initialDLBWPcontrolResourceSetZero: {
      kind: 'leaf',
      type: 'number',
      name: 'initialDLBWPcontrolResourceSetZero',
    },
    initialDLBWPsearchSpaceZero: {
      kind: 'leaf',
      type: 'number',
      name: 'initialDLBWPsearchSpaceZero',
    },
    ul_frequencyBand: {
      kind: 'leaf',
      type: 'number',
      name: 'ul_frequencyBand',
    },
    ul_offstToCarrier: {
      kind: 'leaf',
      type: 'number',
      name: 'ul_offstToCarrier',
    },
    ul_subcarrierSpacing: {
      kind: 'leaf',
      type: 'number',
      name: 'ul_subcarrierSpacing',
    },
    ul_carrierBandwidth: {
      kind: 'leaf',
      type: 'number',
      name: 'ul_carrierBandwidth',
    },
    pMax: { kind: 'leaf', type: 'number', name: 'pMax' },
    initialULBWPlocationAndBandwidth: {
      kind: 'leaf',
      type: 'number',
      name: 'initialULBWPlocationAndBandwidth',
    },
    initialULBWPsubcarrierSpacing: {
      kind: 'leaf',
      type: 'number',
      name: 'initialULBWPsubcarrierSpacing',
    },
    prach_ConfigurationIndex: {
      kind: 'leaf',
      type: 'number',
      name: 'prach_ConfigurationIndex',
    },
    prach_msg1_FDM: { kind: 'leaf', type: 'number', name: 'prach_msg1_FDM' },
    prach_msg1_FrequencyStart: {
      kind: 'leaf',
      type: 'number',
      name: 'prach_msg1_FrequencyStart',
    },
    zeroCorrelationZoneConfig: {
      kind: 'leaf',
      type: 'number',
      name: 'zeroCorrelationZoneConfig',
    },
    preambleReceivedTargetPower: {
      kind: 'leaf',
      type: 'number',
      name: 'preambleReceivedTargetPower',
    },
    preambleTransMax: {
      kind: 'leaf',
      type: 'number',
      name: 'preambleTransMax',
    },
    powerRampingStep: {
      kind: 'leaf',
      type: 'number',
      name: 'powerRampingStep',
    },
    ra_ResponseWindow: {
      kind: 'leaf',
      type: 'number',
      name: 'ra_ResponseWindow',
    },
    ssb_perRACH_OccasionAndCB_PreamblesPerSSB_PR: {
      kind: 'leaf',
      type: 'number',
      name: 'ssb_perRACH_OccasionAndCB_PreamblesPerSSB_PR',
    },
    ssb_perRACH_OccasionAndCB_PreamblesPerSSB: {
      kind: 'leaf',
      type: 'number',
      name: 'ssb_perRACH_OccasionAndCB_PreamblesPerSSB',
    },
    ra_ContentionResolutionTimer: {
      kind: 'leaf',
      type: 'number',
      name: 'ra_ContentionResolutionTimer',
    },
    rsrp_ThresholdSSB: {
      kind: 'leaf',
      type: 'number',
      name: 'rsrp_ThresholdSSB',
    },
    prach_RootSequenceIndex_PR: {
      kind: 'leaf',
      type: 'number',
      name: 'prach_RootSequenceIndex_PR',
    },
    prach_RootSequenceIndex: {
      kind: 'leaf',
      type: 'number',
      name: 'prach_RootSequenceIndex',
    },
    msg1_SubcarrierSpacing: {
      kind: 'leaf',
      type: 'number',
      name: 'msg1_SubcarrierSpacing',
    },
    restrictedSetConfig: {
      kind: 'leaf',
      type: 'number',
      name: 'restrictedSetConfig',
    },
    msg3_DeltaPreamble: {
      kind: 'leaf',
      type: 'number',
      name: 'msg3_DeltaPreamble',
    },
    p0_NominalWithGrant: {
      kind: 'leaf',
      type: 'number',
      name: 'p0_NominalWithGrant',
    },
    pucchGroupHopping: {
      kind: 'leaf',
      type: 'number',
      name: 'pucchGroupHopping',
    },
    hoppingId: { kind: 'leaf', type: 'number', name: 'hoppingId' },
    p0_nominal: { kind: 'leaf', type: 'number', name: 'p0_nominal' },
    ssb_PositionsInBurst_Bitmap: {
      kind: 'leaf',
      type: 'number',
      name: 'ssb_PositionsInBurst_Bitmap',
    },
    ssb_periodicityServingCell: {
      kind: 'leaf',
      type: 'number',
      name: 'ssb_periodicityServingCell',
    },
    dmrs_TypeA_Position: {
      kind: 'leaf',
      type: 'number',
      name: 'dmrs_TypeA_Position',
    },
    subcarrierSpacing: {
      kind: 'leaf',
      type: 'number',
      name: 'subcarrierSpacing',
    },
    referenceSubcarrierSpacing: {
      kind: 'leaf',
      type: 'number',
      name: 'referenceSubcarrierSpacing',
    },
    dl_UL_TransmissionPeriodicity: {
      kind: 'leaf',
      type: 'number',
      name: 'dl_UL_TransmissionPeriodicity',
    },
    nrofDownlinkSlots: {
      kind: 'leaf',
      type: 'number',
      name: 'nrofDownlinkSlots',
    },
    nrofDownlinkSymbols: {
      kind: 'leaf',
      type: 'number',
      name: 'nrofDownlinkSymbols',
    },
    nrofUplinkSlots: { kind: 'leaf', type: 'number', name: 'nrofUplinkSlots' },
    nrofUplinkSymbols: {
      kind: 'leaf',
      type: 'number',
      name: 'nrofUplinkSymbols',
    },
    ssPBCH_BlockPower: {
      kind: 'leaf',
      type: 'number',
      name: 'ssPBCH_BlockPower',
    },
  },
};

export const RUConfigSchema: NodeGroup = {
  kind: 'nodeGroup',
  name: 'ru_config',
  label: 'RU',
  children: {
    iq_width: { kind: 'leaf', type: 'number', name: 'iq_width' },
    iq_width_prach: { kind: 'leaf', type: 'number', name: 'iq_width_prach' },
  },
};

export const FhConfigItemSchema: NodeGroup = {
  kind: 'nodeGroup',
  name: 'fh_config_item',
  label: 'FH Configuration',
  children: {
    T1a_cp_dl: {
      kind: 'leafList',
      name: 'T1a_cp_dl',
      type: 'number',
    },
    T1a_cp_ul: {
      kind: 'leafList',
      name: 'T1a_cp_ul',
      type: 'number',
    },
    T1a_up: {
      kind: 'leafList',
      name: 'T1a_up',
      type: 'number',
    },
    Ta4: {
      kind: 'leafList',
      name: 'Ta4',
      type: 'number',
    },
    ru_config: RUConfigSchema,
  },
};

export const Fhi72Schema: NodeGroup = {
  kind: 'nodeGroup',
  name: 'fhi_72',
  label: 'Fronthaul',
  children: {
    dpdk_devices: {
      kind: 'leafList',
      name: 'dpdk_devices',
      label: 'DPDK Device',
      type: 'string',
    },
    system_core: {
      kind: 'leaf',
      type: 'number',
      name: 'system_core',
      label: 'System Core',
    },
    io_core: {
      kind: 'leaf',
      type: 'number',
      name: 'io_core',
      label: 'IO Core',
    },
    worker_cores: {
      kind: 'leafList',
      name: 'worker_cores',
      label: 'Worker Core',
      type: 'number',
    },
    ru_addr: {
      kind: 'leafList',
      name: 'ru_addr',
      label: 'RU Address',
      type: 'string',
    },
    mtu: { kind: 'leaf', type: 'number', name: 'mtu', label: 'MTU' },
    fh_config: {
      kind: 'nodeGroupList',
      name: 'fh_config',
      label: 'FH Configuration',
      type: FhConfigItemSchema,
    },
  },
};

export const AmfIpAddressSchema: NodeGroup = {
  kind: 'nodeGroup',
  name: 'amf_ip_address_item',
  label: 'AMF IP Address',
  children: {
    ipv4: { kind: 'leaf', type: 'string', name: 'ipv4' },
    ipv6: { kind: 'leaf', type: 'string', name: 'ipv6' },
  },
};

export const NetworkInterfacesSchema: NodeGroup = {
  kind: 'nodeGroup',
  name: 'NETWORK_INTERFACES',
  label: 'Network Interfaces',
  children: {
    GNB_IPV4_ADDRESS_FOR_NG_AMF: {
      kind: 'leaf',
      type: 'string',
      name: 'GNB_IPV4_ADDRESS_FOR_NG_AMF',
    },
    GNB_IPV4_ADDRESS_FOR_NGU: {
      kind: 'leaf',
      type: 'string',
      name: 'GNB_IPV4_ADDRESS_FOR_NGU',
    },
    GNB_PORT_FOR_S1U: {
      kind: 'leaf',
      type: 'number',
      name: 'GNB_PORT_FOR_S1U',
    },
  },
};

export const GnbSchema: NodeGroup = {
  kind: 'nodeGroup',
  name: 'gNB',
  label: 'gNB',
  children: {
    gNB_ID: { kind: 'leaf', type: 'number', name: 'gNB_ID' },
    gNB_DU_ID: { kind: 'leaf', type: 'number', name: 'gNB_DU_ID' },
    gNB_name: { kind: 'leaf', type: 'string', name: 'gNB_name' },
    tracking_area_code: {
      kind: 'leaf',
      type: 'number',
      name: 'tracking_area_code',
      label: 'Tracking Area Code',
    },
    plmn_list: { kind: 'nodeGroupList', name: 'plmn_list', label: "PLMN", type: PLMNSchema },
    nr_cellid: { kind: 'leaf', type: 'number', name: 'nr_cellid' },
    pdsch_AntennaPorts_XP: {
      kind: 'leaf',
      type: 'number',
      name: 'pdsch_AntennaPorts_XP',
      label: 'PDSCH Antenna Ports',
    },
    pdsch_AntennaPorts_N1: {
      kind: 'leaf',
      type: 'number',
      name: 'pdsch_AntennaPorts_N1',
    },
    maxMIMO_layers: { kind: 'leaf', type: 'number', name: 'maxMIMO_layers' },
    pusch_AntennaPorts: {
      kind: 'leaf',
      type: 'number',
      name: 'pusch_AntennaPorts',
    },
    do_CSIRS: { kind: 'leaf', type: 'number', name: 'do_CSIRS' },
    do_SRS: { kind: 'leaf', type: 'number', name: 'do_SRS' },
    sib1_tda: { kind: 'leaf', type: 'number', name: 'sib1_tda' },
    force_UL256qam_off: {
      kind: 'leaf',
      type: 'number',
      name: 'force_UL256qam_off',
    },
    servingCellConfigCommon: {
      kind: 'nodeGroupList',
      name: 'servingCellConfigCommon',
      label: 'Serving Cell Config Common List',
      type: ServingCellConfigCommonSchema,
    },
    SCTP: SCTPSchema,
    // amf_ip_address: { kind: 'nodeGroupList', name: 'amf_ip_address', type: AmfIpAddressSchema },
    // NETWORK_INTERFACES: NetworkInterfacesSchema,
  },
};

export const MACRLCSchema: NodeGroup = {
  kind: 'nodeGroup',
  name: 'MACRLC',
  label: 'MAC/RLC Configuration',
  children: {
    num_cc: { kind: 'leaf', type: 'number', name: 'num_cc' },
    tr_s_preference: { kind: 'leaf', type: 'string', name: 'tr_s_preference' },
    tr_n_preference: { kind: 'leaf', type: 'string', name: 'tr_n_preference' },
    local_n_address: { kind: 'leaf', type: 'string', name: 'local_n_address' },
    remote_n_address: {
      kind: 'leaf',
      type: 'string',
      name: 'remote_n_address',
    },
    local_n_portc: { kind: 'leaf', type: 'number', name: 'local_n_portc' },
    local_n_portd: { kind: 'leaf', type: 'number', name: 'local_n_portd' },
    remote_n_portc: { kind: 'leaf', type: 'number', name: 'remote_n_portc' },
    remote_n_portd: { kind: 'leaf', type: 'number', name: 'remote_n_portd' },
    pusch_TargetSNRx10: {
      kind: 'leaf',
      type: 'number',
      name: 'pusch_TargetSNRx10',
    },
    pucch_TargetSNRx10: {
      kind: 'leaf',
      type: 'number',
      name: 'pucch_TargetSNRx10',
    },
    dl_bler_target_upper: {
      kind: 'leaf',
      type: 'number',
      name: 'dl_bler_target_upper',
    },
    dl_bler_target_lower: {
      kind: 'leaf',
      type: 'number',
      name: 'dl_bler_target_lower',
    },
    ul_bler_target_upper: {
      kind: 'leaf',
      type: 'number',
      name: 'ul_bler_target_upper',
    },
    ul_bler_target_lower: {
      kind: 'leaf',
      type: 'number',
      name: 'ul_bler_target_lower',
    },
    pusch_FailureThres: {
      kind: 'leaf',
      type: 'number',
      name: 'pusch_FailureThres',
    },
    ulsch_max_frame_inactivity: {
      kind: 'leaf',
      type: 'number',
      name: 'ulsch_max_frame_inactivity',
    },
    ul_max_mcs: { kind: 'leaf', type: 'number', name: 'ul_max_mcs' },
    min_grant_prb: { kind: 'leaf', type: 'number', name: 'min_grant_prb' },
  },
};

export const L1Schema: NodeGroup = {
  kind: 'nodeGroup',
  name: 'L1',
  label: 'L1 Configuration',
  children: {
    num_cc: { kind: 'leaf', type: 'number', name: 'num_cc' },
    tr_n_preference: { kind: 'leaf', type: 'string', name: 'tr_n_preference' },
    prach_dtx_threshold: {
      kind: 'leaf',
      type: 'number',
      name: 'prach_dtx_threshold',
    },
    pucch0_dtx_threshold: {
      kind: 'leaf',
      type: 'number',
      name: 'pucch0_dtx_threshold',
    },
    pusch_dtx_threshold: {
      kind: 'leaf',
      type: 'number',
      name: 'pusch_dtx_threshold',
    },
    max_ldpc_iterations: {
      kind: 'leaf',
      type: 'number',
      name: 'max_ldpc_iterations',
    },
    tx_amp_backoff_dB: {
      kind: 'leaf',
      type: 'number',
      name: 'tx_amp_backoff_dB',
    },
    L1_rx_thread_core: {
      kind: 'leaf',
      type: 'number',
      name: 'L1_rx_thread_core',
    },
    L1_tx_thread_core: {
      kind: 'leaf',
      type: 'number',
      name: 'L1_tx_thread_core',
    },
    phase_compensation: {
      kind: 'leaf',
      type: 'number',
      name: 'phase_compensation',
    },
    ofdm_offset_divisor: {
      kind: 'leaf',
      type: 'number',
      name: 'ofdm_offset_divisor',
    },
  },
};

export const RUSchema: NodeGroup = {
  kind: 'nodeGroup',
  name: 'RU',
  label: 'RU Configuration',
  children: {
    local_rf: { kind: 'leaf', type: 'string', name: 'local_rf' },
    nb_tx: { kind: 'leaf', type: 'number', name: 'nb_tx' },
    nb_rx: { kind: 'leaf', type: 'number', name: 'nb_rx' },
    att_tx: { kind: 'leaf', type: 'number', name: 'att_tx' },
    att_rx: { kind: 'leaf', type: 'number', name: 'att_rx' },
    bands: {
      kind: 'leafList',
      name: 'bands',
      label: 'Bands',
      type: 'number',
    },
    max_pdschReferenceSignalPower: {
      kind: 'leaf',
      type: 'number',
      name: 'max_pdschReferenceSignalPower',
    },
    max_rxgain: { kind: 'leaf', type: 'number', name: 'max_rxgain' },
    sf_extension: { kind: 'leaf', type: 'number', name: 'sf_extension' },
    eNB_instances: {
      kind: 'leafList',
      name: 'eNB_instances',
      type: 'number',
    },
    ru_thread_core: { kind: 'leaf', type: 'number', name: 'ru_thread_core' },
    sl_ahead: { kind: 'leaf', type: 'number', name: 'sl_ahead' },
    tr_preference: { kind: 'leaf', type: 'string', name: 'tr_preference' },
    do_precoding: { kind: 'leaf', type: 'number', name: 'do_precoding' },
  },
};

export const LogOptionsEnum = [
  'error',
  'warn',
  'analysis',
  'info',
  'debug',
  'trace',
];

export const LogEnumLabels = [
  'Error',
  'Warning',
  'Analysis',
  'Information',
  'Debug',
  'Trace',
];

export const LogConfigSchema: NodeGroup = {
  kind: 'nodeGroup',
  name: 'log_config',
  label: 'Log Configuration',
  children: {
    global_log_level: {
      kind: 'leaf',
      type: 'enum',
      name: 'global_log_level',
      enum: LogOptionsEnum,
      enumLabel: LogEnumLabels,
    },
    hw_log_level: {
      kind: 'leaf',
      type: 'enum',
      name: 'hw_log_level',
      enum: LogOptionsEnum,
      enumLabel: LogEnumLabels,
    },
    phy_log_level: {
      kind: 'leaf',
      type: 'enum',
      name: 'phy_log_level',
      enum: LogOptionsEnum,
      enumLabel: LogEnumLabels,
    },
    mac_log_level: {
      kind: 'leaf',
      type: 'enum',
      name: 'mac_log_level',
      enum: LogOptionsEnum,
      enumLabel: LogEnumLabels,
    },
    rlc_log_level: {
      kind: 'leaf',
      type: 'enum',
      name: 'rlc_log_level',
      enum: LogOptionsEnum,
      enumLabel: LogEnumLabels,
    },
    pdcp_log_level: {
      kind: 'leaf',
      type: 'enum',
      name: 'pdcp_log_level',
      enum: LogOptionsEnum,
      enumLabel: LogEnumLabels,
    },
    rrc_log_level: {
      kind: 'leaf',
      type: 'enum',
      name: 'rrc_log_level',
      enum: LogOptionsEnum,
      enumLabel: LogEnumLabels,
    },
    ngap_log_level: {
      kind: 'leaf',
      type: 'enum',
      name: 'ngap_log_level',
      enum: LogOptionsEnum,
      enumLabel: LogEnumLabels,
    },
    f1ap_log_level: {
      kind: 'leaf',
      type: 'enum',
      name: 'f1ap_log_level',
      enum: LogOptionsEnum,
      enumLabel: LogEnumLabels,
    },
  },
};

export const OAIGnbSchema: NodeGroup = {
  kind: 'nodeGroup',
  name: 'du_config',
  label: 'DU Configuration',
  root: true,
  children: {
    Asn1_verbosity: { kind: 'leaf', type: 'string', name: 'Asn1_verbosity' },
    Active_gNBs: {
      kind: 'leafList',
      name: 'Active_gNBs',
      type: 'string',
    },
    gNBs: { kind: 'nodeGroupList', name: 'gNBs', type: GnbSchema },
    MACRLCs: { kind: 'nodeGroupList', name: 'MACRLCs', type: MACRLCSchema },
    L1s: { kind: 'nodeGroupList', name: 'L1s', type: L1Schema },
    RUs: { kind: 'nodeGroupList', name: 'RUs', type: RUSchema },
    log_config: LogConfigSchema,
    fhi_72: Fhi72Schema,
  },
};



export const DUConfigSchema: NodeGroup = {
  kind: 'nodeGroup',
  name: 'du_config',
  label: 'DU Configuration',
  children: {
    Active_gNBs: {
      kind: 'leafList',
      name: 'Active_gNBs',
      label: 'Active gNBs',
      type: 'string',
    },
    Asn1_verbosity: {
      kind: 'leaf',
      type: 'string',
      name: 'Asn1_verbosity',
      label: 'ASN1 verbosity',
    },
    gNBs: {
      kind: 'nodeGroupList',
      name: 'gNBs',
      label: 'gNBs',
      type: GnbSchema,
    },
    MACRLCs: {
      kind: 'nodeGroupList',
      name: 'MACRLCs',
      label: 'MACRLCs',
      type: MACRLCSchema,
    },
    L1s: {
      kind: 'nodeGroupList',
      name: 'L1s',
      label: 'L1s',
      type: L1Schema,
    },
    RUs: {
      kind: 'nodeGroupList',
      name: 'RUs',
      label: 'RUs',
      type: RUSchema,
    },
    fhi_72: Fhi72Schema,
    log_config: LogConfigSchema,
  },
};

export const sampleValue = {
  Active_gNBs: ['aircell-benetel-550-1-100mhz-3748'],
  Asn1_verbosity: 'none',
  gNBs: [
    {
      gNB_ID: 3584,
      gNB_DU_ID: 3584,
      gNB_name: 'aircell-benetel-550-1-100mhz-3748',
      tracking_area_code: 1,
      plmn_list: [
        {
          mcc: 1,
          mnc: 1,
          mnc_length: 2,
          snssaiList: [
            {
              sst: 1,
              sd: 16777215,
            },
          ],
        },
      ],
      nr_cellid: 3,
      pdsch_AntennaPorts_XP: 2,
      pdsch_AntennaPorts_N1: 2,
      maxMIMO_layers: 1,
      pusch_AntennaPorts: 4,
      do_CSIRS: 1,
      do_SRS: 0,
      sib1_tda: 15,
      force_UL256qam_off: 1,
      servingCellConfigCommon: [
        {
          physCellId: 0,
          absoluteFrequencySSB: 649920,
          dl_frequencyBand: 78,
          dl_absoluteFrequencyPointA: 646644,
          dl_offstToCarrier: 0,
          dl_subcarrierSpacing: 1,
          dl_carrierBandwidth: 273,
          initialDLBWPlocationAndBandwidth: 1099,
          initialDLBWPsubcarrierSpacing: 1,
          initialDLBWPcontrolResourceSetZero: 11,
          initialDLBWPsearchSpaceZero: 0,
          ul_frequencyBand: 78,
          ul_offstToCarrier: 0,
          ul_subcarrierSpacing: 1,
          ul_carrierBandwidth: 273,
          pMax: 23,
          initialULBWPlocationAndBandwidth: 1099,
          initialULBWPsubcarrierSpacing: 1,
          prach_ConfigurationIndex: 159,
          prach_msg1_FDM: 0,
          prach_msg1_FrequencyStart: 0,
          zeroCorrelationZoneConfig: 0,
          preambleReceivedTargetPower: -100,
          preambleTransMax: 8,
          powerRampingStep: 3,
          ra_ResponseWindow: 5,
          ssb_perRACH_OccasionAndCB_PreamblesPerSSB_PR: 4,
          ssb_perRACH_OccasionAndCB_PreamblesPerSSB: 15,
          ra_ContentionResolutionTimer: 7,
          rsrp_ThresholdSSB: 19,
          prach_RootSequenceIndex_PR: 2,
          prach_RootSequenceIndex: 1,
          msg1_SubcarrierSpacing: 1,
          restrictedSetConfig: 0,
          msg3_DeltaPreamble: 2,
          p0_NominalWithGrant: -96,
          pucchGroupHopping: 0,
          hoppingId: 0,
          p0_nominal: -96,
          ssb_PositionsInBurst_Bitmap: 1,
          ssb_periodicityServingCell: 2,
          dmrs_TypeA_Position: 0,
          subcarrierSpacing: 1,
          referenceSubcarrierSpacing: 1,
          dl_UL_TransmissionPeriodicity: 5,
          nrofDownlinkSlots: 2,
          nrofDownlinkSymbols: 6,
          nrofUplinkSlots: 2,
          nrofUplinkSymbols: 4,
          ssPBCH_BlockPower: -25,
        },
      ],
      SCTP: {
        SCTP_INSTREAMS: 2,
        SCTP_OUTSTREAMS: 2,
      },
    },
  ],
  MACRLCs: [
    {
      num_cc: 1,
      tr_s_preference: 'local_L1',
      tr_n_preference: 'f1',
      local_n_address: '192.168.2.235',
      remote_n_address: '192.168.2.188',
      local_n_portc: 500,
      local_n_portd: 2154,
      remote_n_portc: 501,
      remote_n_portd: 2153,
      pusch_TargetSNRx10: 170,
      pucch_TargetSNRx10: 170,
      dl_bler_target_upper: 0.15,
      dl_bler_target_lower: 0.05,
      ul_bler_target_upper: 0.15,
      ul_bler_target_lower: 0.05,
      pusch_FailureThres: 100,
      ulsch_max_frame_inactivity: 1,
      ul_max_mcs: 16,
      min_grant_prb: 1,
    },
  ],
  L1s: [
    {
      num_cc: 1,
      tr_n_preference: 'local_mac',
      prach_dtx_threshold: 100,
      pucch0_dtx_threshold: 80,
      pusch_dtx_threshold: 10,
      max_ldpc_iterations: 15,
      tx_amp_backoff_dB: 12,
      L1_rx_thread_core: 3,
      L1_tx_thread_core: 4,
      phase_compensation: 0,
    },
  ],
  RUs: [
    {
      local_rf: 'no',
      nb_tx: 4,
      nb_rx: 4,
      att_tx: 0,
      att_rx: 0,
      bands: [78],
      max_pdschReferenceSignalPower: -27,
      max_rxgain: 75,
      sf_extension: 0,
      eNB_instances: [0],
      ru_thread_core: 5,
      sl_ahead: 5,
      tr_preference: 'raw_if4p5',
      do_precoding: 0,
    },
  ],
  log_config: {
    global_log_level: 'info',
    hw_log_level: 'info',
    phy_log_level: 'info',
    mac_log_level: 'info',
    rlc_log_level: 'info',
    pdcp_log_level: 'info',
    rrc_log_level: 'info',
    ngap_log_level: 'info',
    f1ap_log_level: 'info',
  },
  fhi_72: {
    dpdk_devices: ['0000:01:11.0', '0000:01:11.1'],
    system_core: 0,
    io_core: 1,
    worker_cores: [2],
    ru_addr: ['8c:1f:64:d1:13:16', '8c:1f:64:d1:13:16'],
    mtu: 9600,
    fh_config: [
      {
        T1a_cp_dl: [419, 470],
        T1a_cp_ul: [285, 336],
        T1a_up: [294, 345],
        Ta4: [0, 200],
        ru_config: {
          iq_width: 9,
          iq_width_prach: 9,
        },
      },
    ],
  },
};

