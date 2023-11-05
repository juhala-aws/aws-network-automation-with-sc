import {
  CfnOutput, CfnParameter, Fn, Stack,
  custom_resources as cr,
  aws_ec2 as ec2,
  aws_servicecatalog as sc,
  aws_events as events,
  aws_events_targets as targets,
} from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { vpcConfiguration, tgwConfiguration, eventBusArn } from './configuration';

export class BaseVPCStack extends sc.ProductStack {
  constructor(scope: Construct, id: string) {
    super(scope, id);

    const vpc = new ec2.CfnVPC(this, 'BaseVPC', {
      cidrBlock: vpcConfiguration.VPCCidr, // This should be IPAM but static for demo purposes
      tags: [{ key: 'Name', value: 'AnyCompanyVPC' }],
    });

    new CfnOutput(this, 'BaseVPCId', {
      value: vpc.ref,
      exportName: 'BaseVPCId',
    });

    for (let i = 1; i < 4; i++) {
      const subnet = new ec2.Subnet(this, `PrivateSubnet${i}`, {
        vpcId: vpc.ref,
        cidrBlock: Fn.select(i-1, Fn.cidr(vpc.attrCidrBlock, 8, '8')),
        availabilityZone: `${Stack.of(this).region}${vpcConfiguration.AvailabilityZones[i-1]}`,
      });

      new CfnOutput(this, `PrivateSubnet${i}Id`, {
        value: subnet.subnetId,
        exportName: `PrivateSubnet${i}Id`,
      });

      new CfnOutput(this, `PrivateSubnet${i}RouteTableId`, {
        value: subnet.routeTable.routeTableId,
        exportName: `PrivateSubnet${i}RouteTableId`,
      });
    };
  }
}

export class PublicSubnetStack extends sc.ProductStack {
  constructor(scope: Construct, id: string, props: sc.ProductStackProps = {}) {
    super(scope, id, props);

    const enableNat = new CfnParameter(this, 'EnableNAT', {
      allowedValues: ['true', 'false'],
      default: 'false',
      type: 'String',
      description: 'Enable NAT for this VPC (true/false). Default is false',
    });

    const cidrGetter = new cr.AwsCustomResource(this, 'BaseVPCCidrGetter', {
      onCreate: {
        action: 'describeVpcs',
        parameters: {
          VpcIds: [Fn.importValue('BaseVPCId')],
        },
        service: 'ec2',
        physicalResourceId: cr.PhysicalResourceId.of('BaseVPCCidrGetter'),
      },
      policy: cr.AwsCustomResourcePolicy.fromSdkCalls({
        resources: cr.AwsCustomResourcePolicy.ANY_RESOURCE,
      }),
    });

    // Get Cidr and take away the mask
    const cidrs = Fn.cidr(cidrGetter.getResponseField('Vpcs.0.CidrBlock'), 8, '8');

    for (let i = 1; i < 4; i++) {
      const subnet = new ec2.Subnet(this, `PublicSubnet${i}`, {
        vpcId: Fn.importValue('BaseVPCId'),
        cidrBlock: Fn.select(i+2, cidrs),
        availabilityZone: `${Stack.of(this).region}${vpcConfiguration.AvailabilityZones[i-1]}`,
      });

      new CfnOutput(this, `PublicSubnet${i}Id`, {
        value: subnet.subnetId,
        exportName: `PublicSubnet${i}Id`,
      });

      if (enableNat.valueAsString === 'true') {
        const natGw = new ec2.CfnNatGateway(this, `NATGatewayPublicSubnet${i}`, {
          subnetId: subnet.subnetId,
        });

        new ec2.CfnRoute(this, `NATGatewayRoutePrivateSubnet${i}`, {
          routeTableId: Fn.importValue(`PrivateSubnet${i}RouteTableId`),
          destinationCidrBlock: '0.0.0.0/0',
          natGatewayId: natGw.ref,
        });
      }
    };
  }
}

export class TGWAttachmentStack extends sc.ProductStack {
  constructor(scope: Construct, id: string, props: sc.ProductStackProps) {
    super(scope, id, props);

    if (tgwConfiguration.MainTransitGatewayId && tgwConfiguration.MainTGWWorkloadRTId && tgwConfiguration.MainTGWSharedRTId) {

      new TGWAttachment(this, 'TGWAttachment', {
        transitGatewayId: tgwConfiguration.MainTransitGatewayId,
        transitGatewayAssociationRouteTableId: tgwConfiguration.MainTGWWorkloadRTId,
        transitGatewayPropagationRouteTableId: tgwConfiguration.MainTGWSharedRTId,
      });
    }
  }
}

export class MigrateTGWAttachmentStack extends sc.ProductStack {
  constructor(scope: Construct, id: string, props: sc.ProductStackProps) {
    super(scope, id, props);

    if (tgwConfiguration.MigrateTransitGatewayId && tgwConfiguration.MigrateTGWSharedRTId && tgwConfiguration.MigrateTGWWorkloadRTId) {
      new TGWAttachment(this, 'TGWAttachment', {
        transitGatewayId: tgwConfiguration.MigrateTransitGatewayId,
        transitGatewayAssociationRouteTableId: tgwConfiguration.MigrateTGWWorkloadRTId,
        transitGatewayPropagationRouteTableId: tgwConfiguration.MigrateTGWSharedRTId,
      });
    }
  }
}

interface TGWAttachmentProps {
  transitGatewayId: string;
  transitGatewayAssociationRouteTableId: string;
  transitGatewayPropagationRouteTableId: string;
}

class TGWAttachment extends Construct {
  constructor(scope: Construct, id: string, props: TGWAttachmentProps) {
    super(scope, id);

    const cidrGetter = new cr.AwsCustomResource(this, 'BaseVPCCidrGetter', {
      onCreate: {
        action: 'describeVpcs',
        parameters: {
          VpcIds: [Fn.importValue('BaseVPCId')],
        },
        service: 'ec2',
        physicalResourceId: cr.PhysicalResourceId.of('BaseVPCCidrGetter'),
      },
      policy: cr.AwsCustomResourcePolicy.fromSdkCalls({
        resources: cr.AwsCustomResourcePolicy.ANY_RESOURCE,
      }),
    });

    const subnetIds: string[] = [];
    for (let i = 1; i < 4; i++) {

      // Get base VPC cidr and segment to 8 /24 subnets
      const vpcCidrBlock = Fn.cidr(cidrGetter.getResponseField('Vpcs.0.CidrBlock'), 8, '8');

      // Get the 7th subnet from the split
      const tgwSubnetCidrSegment = Fn.select(6, vpcCidrBlock);

      // Split the 7th subnet to /27 subnets
      const cidrBlock = Fn.select(i-1, Fn.cidr(tgwSubnetCidrSegment, 8, '5'));

      const subnet = new ec2.Subnet(this, `TransitGatewaySubnet${i}`, {
        vpcId: Fn.importValue('BaseVPCId'),
        cidrBlock,
        availabilityZone: `${Stack.of(this).region}${vpcConfiguration.AvailabilityZones[i-1]}`,
      });
      subnetIds.push(subnet.subnetId);

      new CfnOutput(this, `TransitGatewaySubnet${i}Id`, {
        value: subnet.subnetId,
        exportName: `TransitGatewaySubnet${i}Id`,
      });
    };

    new events.Rule(this, 'AttachmentCreatedRule', {
      eventPattern: {
        source: ['aws.ec2'],
        detailType: ['AWS API Call via CloudTrail'],
        detail: {
          eventName: ['CreateTransitGatewayVpcAttachment'],
        },
      },
      targets: [new targets.EventBus(events.EventBus.fromEventBusArn(this, 'EventBus', eventBusArn))],
    });

    // Transit Gateway attachment
    const attachment = new ec2.CfnTransitGatewayVpcAttachment(this, 'TransitGatewayVpcAttachment', {
      vpcId: Fn.importValue('BaseVPCId'),
      subnetIds,
      transitGatewayId: props.transitGatewayId,
      tags: [{ key: 'Type', value: 'Workload' }],
    });

    // Create default route towards TGW from each of the Private subnets
    for (let i = 1; i < 4; i++) {
      new ec2.CfnRoute(this, `TransitGatewayRoute${i}`, {
        transitGatewayId: props.transitGatewayId,
        routeTableId: Fn.importValue(`PrivateSubnet${i}RouteTableId`),
        destinationCidrBlock: '0.0.0.0/0',
      }).addDependency(attachment);
    };
  }
}