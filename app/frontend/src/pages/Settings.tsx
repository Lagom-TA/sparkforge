import { useEffect, useState } from 'react';
import {
  ArrowLeft,
  Bell,
  BrainCircuit,
  Check,
  Code2,
  Database,
  Eye,
  LayoutPanelTop,
  RotateCcw,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import {
  WorkspacePreferences,
  defaultPreferences,
  getPreferences,
  savePreferences,
} from '@/lib/preferences';

function SettingRow({
  title,
  description,
  checked,
  onCheckedChange,
}: {
  title: string;
  description: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-6 py-4">
      <div className="min-w-0">
        <Label className="text-sm font-medium">{title}</Label>
        <p className="mt-1 max-w-xl text-sm leading-6 text-muted-foreground">{description}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onCheckedChange} aria-label={title} />
    </div>
  );
}

export default function Settings() {
  const [preferences, setPreferences] = useState<WorkspacePreferences>(getPreferences);
  const [saved, setSaved] = useState(true);

  useEffect(() => {
    setSaved(false);
    const timer = window.setTimeout(() => {
      savePreferences(preferences);
      setSaved(true);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [preferences]);

  const update = <K extends keyof WorkspacePreferences>(
    key: K,
    value: WorkspacePreferences[K],
  ) => setPreferences((current) => ({ ...current, [key]: value }));

  const reset = () => {
    setPreferences(defaultPreferences);
    toast.success('工作区偏好已恢复默认。');
  };

  return (
    <main className="min-h-screen bg-background">
      <header className="sticky top-0 z-30 border-b border-border/70 bg-card/95">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" asChild>
              <Link to="/" aria-label="返回首页"><ArrowLeft className="h-4 w-4" /></Link>
            </Button>
            <div>
              <h1 className="text-sm font-semibold">设置</h1>
              <p className="text-xs text-muted-foreground">管理生成流程与工作区体验</p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            {saved ? <><Check className="h-3.5 w-3.5 text-emerald-600" />已自动保存</> : '正在保存…'}
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-5xl gap-8 px-4 py-8 sm:px-6 lg:grid-cols-[200px_1fr]">
        <aside className="hidden lg:block">
          <nav className="sticky top-20 space-y-1 text-sm">
            {[
              ['workspace', '工作区体验', LayoutPanelTop],
              ['generation', '生成流程', Sparkles],
              ['notifications', '通知', Bell],
              ['platform', '平台能力', Database],
            ].map(([anchor, label, Icon]) => (
              <a key={String(anchor)} href={`#${anchor}`} className="flex items-center gap-2 rounded-md px-3 py-2 text-muted-foreground hover:bg-secondary hover:text-foreground">
                <Icon className="h-4 w-4" />{String(label)}
              </a>
            ))}
          </nav>
        </aside>

        <section className="min-w-0 space-y-8">
          <div className="max-w-2xl">
            <p className="text-sm font-medium text-primary">偏好中心</p>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight">让工作区适应你的构建方式</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              设置会保存在当前浏览器并立即生效，不会改变已生成的版本或业务数据。
            </p>
          </div>

          <section id="workspace" className="scroll-mt-20 overflow-hidden rounded-xl border bg-card">
            <div className="flex items-center gap-3 border-b px-5 py-4">
              <Eye className="h-4 w-4 text-primary" />
              <div><h3 className="font-semibold">工作区体验</h3><p className="text-xs text-muted-foreground">控制预览和界面密度</p></div>
            </div>
            <div className="px-5">
              <div className="flex flex-col justify-between gap-3 py-4 sm:flex-row sm:items-center">
                <div>
                  <Label htmlFor="preview-mode">默认预览设备</Label>
                  <p className="mt-1 text-sm text-muted-foreground">打开项目时优先使用的 Live App 宽度。</p>
                </div>
                <Select value={preferences.defaultPreview} onValueChange={(value: 'desktop' | 'mobile') => update('defaultPreview', value)}>
                  <SelectTrigger id="preview-mode" className="w-full sm:w-44"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="desktop">桌面预览</SelectItem>
                    <SelectItem value="mobile">移动预览</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Separator />
              <SettingRow title="构建后打开产物" description="新版本生成完成后自动展开 Live App 面板。" checked={preferences.autoOpenArtifact} onCheckedChange={(value) => update('autoOpenArtifact', value)} />
              <Separator />
              <SettingRow title="紧凑时间线" description="减少公开动作之间的间距，在一屏内查看更多阶段记录。" checked={preferences.compactTimeline} onCheckedChange={(value) => update('compactTimeline', value)} />
              <Separator />
              <SettingRow title="减少动态效果" description="关闭非必要的位移、脉冲和过渡动画。" checked={preferences.reduceMotion} onCheckedChange={(value) => update('reduceMotion', value)} />
            </div>
          </section>

          <section id="generation" className="scroll-mt-20 overflow-hidden rounded-xl border bg-card">
            <div className="flex items-center gap-3 border-b px-5 py-4">
              <SlidersHorizontal className="h-4 w-4 text-primary" />
              <div><h3 className="font-semibold">生成与安全</h3><p className="text-xs text-muted-foreground">避免误操作并明确模型职责</p></div>
            </div>
            <div className="px-5">
              <SettingRow title="删除记录前确认" description="在 Live App 删除业务记录前显示确认提示。" checked={preferences.confirmRecordDeletion} onCheckedChange={(value) => update('confirmRecordDeletion', value)} />
              <Separator />
              <div className="grid gap-3 py-5 sm:grid-cols-2">
                <div className="rounded-lg bg-secondary/70 p-4">
                  <BrainCircuit className="h-4 w-4 text-primary" />
                  <p className="mt-3 text-sm font-medium">规划与蓝图</p>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">gpt-6-astra · 结构化需求、实体与验收标准</p>
                </div>
                <div className="rounded-lg bg-secondary/70 p-4">
                  <Code2 className="h-4 w-4 text-primary" />
                  <p className="mt-3 text-sm font-medium">构建与修复</p>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">deepseek-v4-pro · 受控 AppSpec 与源码</p>
                </div>
              </div>
              <p className="pb-5 text-xs leading-5 text-muted-foreground">模型由生成协议固定，以保证蓝图和运行时格式兼容，因此不提供任意模型切换。</p>
            </div>
          </section>

          <section id="notifications" className="scroll-mt-20 overflow-hidden rounded-xl border bg-card">
            <div className="flex items-center gap-3 border-b px-5 py-4">
              <Bell className="h-4 w-4 text-primary" />
              <div><h3 className="font-semibold">站内通知</h3><p className="text-xs text-muted-foreground">控制工作区内的即时反馈</p></div>
            </div>
            <div className="px-5">
              <SettingRow title="完成提醒" description="规划完成或新版本生成后显示成功通知。" checked={preferences.completionNotifications} onCheckedChange={(value) => update('completionNotifications', value)} />
              <Separator />
              <SettingRow title="错误提醒" description="任务或数据保存失败时显示可操作的错误通知。" checked={preferences.errorNotifications} onCheckedChange={(value) => update('errorNotifications', value)} />
            </div>
          </section>

          <section id="platform" className="scroll-mt-20 rounded-xl border bg-card p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="flex gap-3">
                <ShieldCheck className="mt-0.5 h-5 w-5 text-emerald-700" />
                <div>
                  <h3 className="font-semibold">Atoms Cloud 已连接</h3>
                  <p className="mt-1 max-w-xl text-sm leading-6 text-muted-foreground">认证、项目、版本和应用记录均按当前用户隔离；浏览器中不保存第三方 API Key。</p>
                </div>
              </div>
              <Badge variant="secondary">运行正常</Badge>
            </div>
          </section>

          <div className="flex items-center justify-between gap-4 border-t pt-5">
            <p className="text-xs text-muted-foreground">恢复默认不会删除项目、版本或应用记录。</p>
            <Button variant="outline" onClick={reset}><RotateCcw className="mr-2 h-4 w-4" />恢复默认</Button>
          </div>
        </section>
      </div>
    </main>
  );
}