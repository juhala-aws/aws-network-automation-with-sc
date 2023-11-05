import {
  Stack, StackProps, CfnOutput,
  aws_ec2 as ec2,
  aws_ram as ram,
  aws_events as events,
  aws_iam as iam,
  aws_ssm as ssm,
  aws_events_targets as targets,
  aws_stepfunctions as sf,
} from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { testEnvConfiguration } from './configuration';


export class TestEnvironmentStack extends Stack {

  private readonly tgws: ec2.CfnTransitGateway[];

  constructor(scope: Construct, id: string, props: StackProps = {}) {
    super(scope, id, props);

    // Define how many Transit Gateway and Route Tables you want to create.
    // With these you can, for example, simulate migrations
    const tgwNames = ['Main', 'Migrate'];
    const routeTableNames = ['Workload', 'Shared'];

    this.tgws = [];
    tgwNames.forEach(tgwName => {
      const tgw = new ec2.CfnTransitGateway(this, `${tgwName}TransitGateway`, {
        defaultRouteTableAssociation: 'disable',
        defaultRouteTablePropagation: 'disable',
        autoAcceptSharedAttachments: 'disable',
        tags: [{ key: 'Name', value: `${tgwName}TransitGateway` }],
      });
      this.tgws.push(tgw);

      new CfnOutput(this, `${tgwName}TransitGatewayIdOutput`, {
        value: tgw.ref,
        exportName: `${tgwName}TransitGatewayId`,
      });

      routeTableNames.forEach(rtName => {
        const routeTable = new ec2.CfnTransitGatewayRouteTable(this, `${tgwName}${rtName}RouteTable`, {
          transitGatewayId: tgw.ref,
          tags: [
            { key: 'Name', value: `${tgwName}${rtName}RouteTable` },
            { key: 'Type', value: rtName },
          ],
        });

        new CfnOutput(this, `${tgwName}${rtName}RouteTableIdOutput`, {
          value: routeTable.ref,
          exportName: `${tgwName}${rtName}RouteTableId`,
        });

        if (tgwName === 'Main') {
          new ssm.StringParameter(this, `${rtName}RouteTableId`, {
            stringValue: routeTable.ref,
            parameterName: `${rtName}RouteTableId`,
          });
        }
      });

    });

    // Share resources to Organisation
    if (testEnvConfiguration.TGWShare === true && testEnvConfiguration.TGWSharingPrincipal) {
      new ram.CfnResourceShare(this, 'TransitGatewayShare', {
        name: 'TransitGatewayShare',
        resourceArns: this.tgws.map(tgw => `arn:aws:ec2:${Stack.of(this).region}:${Stack.of(this).account}:transit-gateway/${tgw.ref}`),
        principals: testEnvConfiguration.TGWSharingPrincipal.map(
          principal => `arn:aws:organizations::${Stack.of(this).account}:organization/${principal}`),
      });
    }

    // Event Bus to receive attachment created notifications
    const eventBus = new events.EventBus(this, 'TGWAttachmentBus', {
      eventBusName: 'TGWAttachmentBus',
    });

    eventBus.addToResourcePolicy(
      new iam.PolicyStatement({
        sid: 'PutEvents',
        actions: ['events:PutEvents'],
        resources: [eventBus.eventBusArn],
        effect: iam.Effect.ALLOW,
        principals: [new iam.AnyPrincipal()],
        conditions: {
          StringEquals: {
            'aws:PrincipalOrgID': 'o-zl069iyk6y',
          },
        },
      }),
    );

    const smRole = new iam.Role(this, 'StateMachineRole', {
      assumedBy: new iam.ServicePrincipal('states'),
    });

    smRole.addToPolicy(
      new iam.PolicyStatement({
        actions: [
          'ec2:DisassociateTransitGatewayRouteTable',
          'ec2:ModifyTransitGatewayVpcAttachment',
          'ec2:DisableTransitGatewayRouteTablePropagation',
          'ec2:DescribeTransitGatewayRouteTables',
          'ec2:AssociateTransitGatewayRouteTable',
          'ec2:AcceptTransitGatewayVpcAttachment',
          'ec2:DescribeTransitGatewayVpcAttachments',
          'ec2:EnableTransitGatewayRouteTablePropagation',
          'ssm:GetParameter',
        ],
        effect: iam.Effect.ALLOW,
        resources: ['*'],
      }),
    );

    const stateMachine = new sf.StateMachine(this, 'AttachmentAssociation', {
      stateMachineName: 'AttachmentAssociation',
      stateMachineType: sf.StateMachineType.STANDARD,
      definitionBody: sf.DefinitionBody.fromFile('./src/state_machine.json'),
      role: smRole,
    });

    const smTarget = new targets.SfnStateMachine(stateMachine);

    new events.Rule(this, 'TGWAttachmentRule', {
      eventBus,
      ruleName: 'AttachmentCreated',
      eventPattern: {
        source: ['aws.ec2'],
        detail: {
          eventName: ['CreateTransitGatewayVpcAttachment'],
        },
      },
      targets: [smTarget],
    });

  }

}