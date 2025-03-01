import {brokerSafeId} from '../shared';
import {cloneParent} from '../messageHelper';
import {MessageFlowBroker} from '../EventBroker';

export default function MessageFlow(flowDef, context) {
  const {id, type = 'message', name, target, source, behaviour, parent} = flowDef;
  const sourceActivity = context.getActivityById(source.id);
  const sourceEndConsumerTag = `_message-on-end-${brokerSafeId(id)}`;
  const sourceMessageConsumerTag = `_message-on-message-${brokerSafeId(id)}`;
  const {debug} = context.environment.Logger(type.toLowerCase());

  if (!sourceActivity) return;

  const counters = {
    messages: 0,
    discard: 0,
  };

  const flowApi = {
    id,
    type,
    name,
    target,
    source,
    behaviour,
    get counters() {
      return {...counters};
    },
    activate,
    deactivate,
    getApi,
    getState,
    recover,
    resume,
    stop,
  };

  const {broker, on, once, emit, waitFor} = MessageFlowBroker(flowApi);

  flowApi.on = on;
  flowApi.once = once;
  flowApi.emit = emit;
  flowApi.waitFor = waitFor;

  Object.defineProperty(flowApi, 'broker', {
    enumerable: true,
    get: () => broker,
  });

  return flowApi;

  function onSourceEnd(_, {content}) {
    ++counters.messages;
    debug(`<${id}> sending message from <${source.processId}.${source.id}> to`, target.id ? `<${target.processId}.${target.id}>` : `<${target.processId}>`);
    broker.publish('event', 'message.outbound', createMessage(content.message));
  }

  function onSourceMessage() {
    deactivate();
  }

  function createMessage(message) {
    return {
      id,
      type,
      name,
      source: {...source},
      target: {...target},
      parent: parent && cloneParent(parent),
      message,
    };
  }

  function stop() {
    deactivate();
    broker.stop();
  }

  function getState() {
    return {
      id,
      type,
      counters: {...counters},
    };
  }

  function recover(state) {
    Object.assign(counters, state.counters);
    broker.recover(state.broker);
  }

  function resume() {
    broker.resume();
  }

  function getApi() {
    return flowApi;
  }

  function activate() {
    sourceActivity.broker.subscribeTmp('event', 'activity.message', onSourceMessage, {consumerTag: sourceMessageConsumerTag, noAck: true});
    sourceActivity.broker.subscribeTmp('event', 'activity.end', onSourceEnd, {consumerTag: sourceEndConsumerTag, noAck: true});
  }

  function deactivate() {
    sourceActivity.broker.cancel(sourceMessageConsumerTag);
    sourceActivity.broker.cancel(sourceEndConsumerTag);
  }
}
