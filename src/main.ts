import { App, Environment } from 'aws-cdk-lib';
import { PipelineStack } from './pipeline';
import { TestEnvironmentStack } from './test-env';

const env: Environment = {
  region: 'eu-west-1',
};

const app = new App();

new PipelineStack(app, 'PipelineStack', {
  env,
});

new TestEnvironmentStack(app, 'TestEnvironment');

app.synth();