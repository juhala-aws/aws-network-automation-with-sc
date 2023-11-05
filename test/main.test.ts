import { App } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { PipelineStack } from '../src/pipeline';

test('PipelineSnapshot', () => {
  const app = new App();
  const stack = new PipelineStack(app, 'PipelineTest');

  const template = Template.fromStack(stack);
  expect(template.toJSON()).toMatchSnapshot();
});