'use client'

import Button from '@/components/ui/Button'
import IconButton from '@/components/ui/IconButton'
import ButtonGroup from '@/components/ui/ButtonGroup'

export default function ButtonShowcase() {
  return (
    <div className="min-h-screen bg-background p-8">
      <div className="max-w-4xl mx-auto space-y-12">
        <div className="text-center">
          <h1 className="text-4xl font-bold text-ink mb-4">
            按鈕樣式展示
          </h1>
          <p className="text-lg text-ink-soft">
            統一且美觀的按鈕設計系統
          </p>
        </div>

        {/* 基本變體 */}
        <section className="space-y-6">
          <h2 className="text-2xl font-semibold text-ink">基本變體</h2>
          <div className="flex flex-wrap gap-4">
            <Button variant="primary">主要按鈕</Button>
            <Button variant="secondary">次要按鈕</Button>
            <Button variant="success">成功按鈕</Button>
            <Button variant="danger">危險按鈕</Button>
            <Button variant="warning">警告按鈕</Button>
            <Button variant="ghost">幽靈按鈕</Button>
            <Button variant="link">連結按鈕</Button>
          </div>
        </section>

        {/* 尺寸變體 */}
        <section className="space-y-6">
          <h2 className="text-2xl font-semibold text-ink">尺寸變體</h2>
          <div className="flex flex-wrap items-center gap-4">
            <Button size="sm">小按鈕</Button>
            <Button size="default">預設按鈕</Button>
            <Button size="lg">大按鈕</Button>
            <Button size="xl">超大按鈕</Button>
          </div>
        </section>

        {/* 帶圖示的按鈕 */}
        <section className="space-y-6">
          <h2 className="text-2xl font-semibold text-ink">帶圖示的按鈕</h2>
          <div className="flex flex-wrap gap-4">
            <Button 
              leftIcon={
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
              }
            >
              新增項目
            </Button>
            <Button 
              variant="secondary"
              rightIcon={
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                </svg>
              }
            >
              喜歡
            </Button>
            <Button 
              variant="success"
              leftIcon={
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              }
            >
              確認
            </Button>
          </div>
        </section>

        {/* 載入狀態 */}
        <section className="space-y-6">
          <h2 className="text-2xl font-semibold text-ink">載入狀態</h2>
          <div className="flex flex-wrap gap-4">
            <Button loading>載入中...</Button>
            <Button variant="secondary" loading>處理中</Button>
            <Button variant="success" loading>正在儲存</Button>
          </div>
        </section>

        {/* 禁用狀態 */}
        <section className="space-y-6">
          <h2 className="text-2xl font-semibold text-ink">禁用狀態</h2>
          <div className="flex flex-wrap gap-4">
            <Button disabled>無法點擊</Button>
            <Button variant="secondary" disabled>禁用次要</Button>
            <Button variant="danger" disabled>禁用危險</Button>
          </div>
        </section>

        {/* 圖示按鈕 */}
        <section className="space-y-6">
          <h2 className="text-2xl font-semibold text-ink">圖示按鈕</h2>
          <div className="flex flex-wrap gap-4">
            <IconButton tooltip="編輯">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
            </IconButton>
            <IconButton variant="danger" tooltip="刪除">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </IconButton>
            <IconButton variant="success" tooltip="確認">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </IconButton>
            <IconButton loading tooltip="載入中" />
          </div>
        </section>

        {/* 按鈕群組 */}
        <section className="space-y-6">
          <h2 className="text-2xl font-semibold text-ink">按鈕群組</h2>
          <div className="space-y-4">
            <div>
              <h3 className="text-lg font-medium text-ink mb-2">連接的按鈕組</h3>
              <ButtonGroup connected={true}>
                <Button variant="secondary">左</Button>
                <Button variant="secondary">中</Button>
                <Button variant="secondary">右</Button>
              </ButtonGroup>
            </div>
            <div>
              <h3 className="text-lg font-medium text-ink mb-2">分離的按鈕組</h3>
              <ButtonGroup connected={false}>
                <Button>全部</Button>
                <Button variant="secondary">已開放</Button>
                <Button variant="secondary">已關閉</Button>
              </ButtonGroup>
            </div>
            <div>
              <h3 className="text-lg font-medium text-ink mb-2">垂直按鈕組</h3>
              <ButtonGroup orientation="vertical" connected={false}>
                <Button variant="secondary">選項一</Button>
                <Button variant="secondary">選項二</Button>
                <Button variant="secondary">選項三</Button>
              </ButtonGroup>
            </div>
          </div>
        </section>

        {/* 實際使用範例 */}
        <section className="space-y-6">
          <h2 className="text-2xl font-semibold text-ink">實際使用範例</h2>
          <div className="bg-surface p-6 rounded-lg shadow-lg space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-semibold">文章管理</h3>
              <Button 
                leftIcon={
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                }
              >
                新增文章
              </Button>
            </div>
            
            <div className="flex justify-between items-center">
              <ButtonGroup connected={false}>
                <Button size="sm">全部</Button>
                <Button variant="ghost" size="sm">已發布</Button>
                <Button variant="ghost" size="sm">草稿</Button>
              </ButtonGroup>
              
              <div className="flex gap-2">
                <IconButton tooltip="重新整理">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                </IconButton>
                <IconButton tooltip="設定">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                </IconButton>
              </div>
            </div>
            
            <div className="flex justify-end gap-2 pt-4 border-t">
              <Button variant="ghost">取消</Button>
              <Button variant="success">儲存</Button>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}
