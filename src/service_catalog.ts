import {
  Stack, StackProps, Stage, StageProps,
  aws_servicecatalog as sc,
  aws_s3 as s3,
  aws_iam as iam,
} from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { tgwConfiguration } from './configuration';
import {
  BaseVPCStack,
  TGWAttachmentStack,
  MigrateTGWAttachmentStack,
  PublicSubnetStack,
} from './vpc_product';

export class ServiceCatalogStage extends Stage {
  constructor(scope: Construct, id: string, props: StageProps = {}) {
    super(scope, id, props);

    new ServiceCatalogStack(this, 'ServiceCatalogStack', {
      env: props.env,
    });
  }
}

class ServiceCatalogStack extends Stack {
  constructor(scope: Construct, id: string, props: StackProps = {}) {
    super(scope, id, props);

    const assetBucket = new s3.Bucket(this, 'AssetBucket', {
      bucketName: 'anycompanycatalogassetbucket',
    });

    assetBucket.grantRead(new iam.OrganizationPrincipal('o-zl069iyk6y'));

    const portfolio = new sc.Portfolio(this, 'VPCPortfolio', {
      displayName: 'AnyCompany VPC Portfolio',
      providerName: 'Jose',
    });

    // Base VPC Module
    const baseVPCProductHistory = new sc.ProductStackHistory(this, 'BaseVPCProductHistory', {
      productStack: new BaseVPCStack(this, 'BaseVPCStack'),
      currentVersionName: 'v1',
      currentVersionLocked: true,
      validateTemplate: true,
    });

    const baseVPCProduct = new sc.CloudFormationProduct(this, 'BaseVPCProduct', {
      productName: 'AnyCompany Base VPC',
      owner: 'Jose',
      productVersions: [
        baseVPCProductHistory.currentVersion(),
      ],
    });

    portfolio.addProduct(baseVPCProduct);


    // Base VPC Public Subnets module
    const publicSubnetProductHistory = new sc.ProductStackHistory(this, 'PublicSubnetProductHistory', {
      productStack: new PublicSubnetStack(this, 'PublicSubnetStack', {
        assetBucket,
      }),
      currentVersionName: 'v1',
      currentVersionLocked: true,
      validateTemplate: true,
    });

    const PublicSubnetProduct = new sc.CloudFormationProduct(this, 'PublicSubnetProduct', {
      productName: 'AnyCompany Base VPC Public Subnets',
      owner: 'Jose',
      productVersions: [
        publicSubnetProductHistory.currentVersion(),
      ],
    });

    portfolio.addProduct(PublicSubnetProduct);


    // Base VPC TGW Attachment modules
    let tgwAttachmentProducts: sc.CloudFormationProductVersion[] = [];

    if (tgwConfiguration.MainTransitGatewayId) {
      const mainTGWAttachmentProduct = new sc.ProductStackHistory(this, 'MainTGWAttachmentProductHistory', {
        productStack: new TGWAttachmentStack(this, 'MainTGWAttachmentStack', {
          assetBucket,
        }),
        currentVersionName: 'main_v1',
        currentVersionLocked: true,
        validateTemplate: true,
      });
      tgwAttachmentProducts.push(mainTGWAttachmentProduct.currentVersion());
    };


    if (tgwConfiguration.MigrateTransitGatewayId) {
      // Base VPC Migrate TGW Attachment module
      const migrateTGWAttachmentProduct = new sc.ProductStackHistory(this, 'MigrateTGWAttachmentProductHistory', {
        productStack: new MigrateTGWAttachmentStack(this, 'MigrateTGWAttachmentStack', {
          assetBucket,
        }),
        currentVersionName: 'migrate_v1',
        currentVersionLocked: true,
        validateTemplate: true,
      });
      tgwAttachmentProducts.push(migrateTGWAttachmentProduct.currentVersion());
    }

    if (tgwAttachmentProducts.length !== 0) {
      portfolio.addProduct(new sc.CloudFormationProduct(this, 'TGWAttachmentProduct', {
        productName: 'AnyCompany Base VPC TGW Attachment',
        owner: 'Jose',
        productVersions: tgwAttachmentProducts,
      }));
    }
  }
}