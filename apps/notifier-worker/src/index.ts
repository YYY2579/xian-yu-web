export type { NotificationPreference, NotifierDeps } from './notifier.service';
export { NotifierService } from './notifier.service';
export { placeholder } from './placeholder';
export type { TemplateContext } from './templates/message-templates';
export {
  renderEmail,
  renderInApp,
  renderWecom,
  TEMPLATE_VERSION,
} from './templates/message-templates';
