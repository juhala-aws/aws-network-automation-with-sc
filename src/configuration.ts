export const tgwConfiguration: TGWConfiguration = {
  MainTransitGatewayId: '',
  MainTGWSharedRTId: '',
  MainTGWWorkloadRTId: '',
  MigrateTransitGatewayId: '',
  MigrateTGWWorkloadRTId: '',
  MigrateTGWSharedRTId: '',
};

export const testEnvConfiguration: TestEnvConfiguration = {
  TGWShare: true,
  TGWSharingPrincipal: [''],
};

export const vpcConfiguration: VPCConfiguration = {
  VPCCidr: '10.0.0.0/20',
  AvailabilityZones: ['a', 'b', 'c'],
};

export const eventBusArn = '';

type TestEnvConfiguration = {
  TGWShare: boolean;
  TGWSharingPrincipal?: string[]; //Organisation IDs only  o-XXXXXXX or ou-XXXXXXX
}

type VPCConfiguration = {
  VPCCidr: string;
  AvailabilityZones: ['a', 'b', 'c'];
}

type TGWConfiguration = {
  MainTransitGatewayId?: string;
  MainTGWWorkloadRTId?: string;
  MainTGWSharedRTId?: string;
  MigrateTransitGatewayId?: string;
  MigrateTGWWorkloadRTId?: string;
  MigrateTGWSharedRTId?: string;
}