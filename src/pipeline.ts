import {
  Stack, StackProps,
  pipelines,
  aws_codecommit as codecommit,
} from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { ServiceCatalogStage } from './service_catalog';


export class PipelineStack extends Stack {
  constructor(scope: Construct, id: string, props: StackProps = {}) {
    super(scope, id, props);

    const catalogRepo = new codecommit.Repository(
      this,
      'ServiceCatalogRepository',
      {
        repositoryName: 'ServiceCatalogRepository',
      },
    );

    const catalogPipeline = new pipelines.CodePipeline(
      this,
      'ServiceCatalogPipeline',
      {
        synth: new pipelines.ShellStep('Synth', {
          input: pipelines.CodePipelineSource.codeCommit(
            catalogRepo,
            'main',
          ),
          commands: ['npm install yarn', 'yarn install', 'npx projen build'],
          primaryOutputDirectory: 'cdk.out',
        }),
      },
    );

    catalogPipeline.addStage(new ServiceCatalogStage(this, 'ServiceCatalogStage', {
      env: props.env,
    }));
  }
}