import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Eye, Zap } from 'lucide-react';
import AppPreview from '@/components/AppPreview';
import { Badge } from '@/components/ui/badge';
import {
  PublicShareSnapshot,
  getErrorMessage,
  getPublicShare,
} from '@/lib/sparkforge';

export default function Share() {
  const { projectId, token } = useParams();
  const [snapshot, setSnapshot] = useState<PublicShareSnapshot>();
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setSnapshot(undefined);
    setError('');
    const load = async () => {
      try {
        if (!projectId || !token) {
          throw new Error('分享链接格式不正确。');
        }
        const result = await getPublicShare(Number(projectId), token);
        if (!cancelled) setSnapshot(result);
      } catch (err) {
        if (!cancelled) setError(getErrorMessage(err));
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [projectId, token]);

  if (error) {
    return (
      <div className="grid min-h-screen place-items-center px-4 text-center">
        <div>
          <h1 className="text-xl font-semibold">无法打开分享内容</h1>
          <p className="mt-2 text-muted-foreground">{error}</p>
          <Link to="/" className="mt-5 inline-flex text-primary">
            返回 SparkForge
          </Link>
        </div>
      </div>
    );
  }

  if (!snapshot) {
    return (
      <div className="grid min-h-screen place-items-center text-muted-foreground">
        正在验证分享链接…
      </div>
    );
  }

  return (
    <main className="min-h-screen">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex h-16 max-w-screen-xl items-center justify-between px-4">
          <Link to="/" className="flex items-center gap-2 font-semibold">
            <span className="grid h-8 w-8 place-items-center rounded-md bg-primary text-primary-foreground">
              <Zap className="h-4 w-4" />
            </span>
            SparkForge
          </Link>
          <Badge variant="outline">
            <Eye className="mr-1.5 h-3.5 w-3.5" />
            只读预览
          </Badge>
        </div>
      </header>
      <section className="mx-auto max-w-screen-xl px-4 py-8">
        <Link
          to="/"
          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          返回首页
        </Link>
        <div className="my-6">
          <h1 className="text-2xl font-semibold">{snapshot.project.name}</h1>
          <p className="mt-2 text-muted-foreground">
            {snapshot.version.app_spec.app.description}
          </p>
        </div>
        <AppPreview spec={snapshot.version.app_spec} />
      </section>
    </main>
  );
}