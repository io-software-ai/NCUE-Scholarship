'use client';

import { useEffect, useRef, useState } from 'react';
import { Editor } from '@tinymce/tinymce-react';
import { useSystemSettings } from '@/hooks/useSystemSettings';

const TinyMceEditor = ({ value, onChange, placeholder, disabled, init = {} }) => {
    const [isClient, setIsClient] = useState(false);
    const editorRef = useRef(null);
    const { settings, loading: settingsLoading } = useSystemSettings();

    useEffect(() => {
        // 確保程式碼只在客戶端執行，以避免 Next.js 的 SSR (伺服器端渲染) 問題。
        setIsClient(true);
    }, []);

    const handleEditorChange = (content, editor) => {
        // 當編輯器內容改變時，呼叫從 props 傳入的 onChange 函式，將新的內容傳回給父元件，更新父元件的狀態。
        onChange(content);
    };

    // 客戶端就緒且系統設定（含 TinyMCE 金鑰）載入完成前，先顯示載入提示。
    // 注意：Editor 掛載時即以當下 apiKey 載入 cloud script，之後變更 prop 不會重新載入，
    // 因此必須等 /api/settings/public 回來後再掛載，否則資料庫中的金鑰會讀不到。
    if (!isClient || settingsLoading) {
        return (
            <div
                style={{
                    minHeight: '350px',
                    border: '1px solid #ccc',
                    borderRadius: '4px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: '#f5f5f5',
                    color: '#666'
                }}
            >
                載入編輯器中...
            </div>
        );
    }

    const defaultInit = {
        min_height: 350,
        autoresize_bottom_margin: 25,
        resize: 'vertical',
        language: 'zh_TW',
        language_url: '/langs/zh_TW.js',
        placeholder: placeholder || '',

        plugins: [
            'advlist', 'autolink', 'lists', 'link', 'image', 'charmap',
            'preview', 'anchor', 'searchreplace', 'visualblocks', 'code',
            'fullscreen', 'insertdatetime', 'media', 'table', 'help', 'wordcount',
            'autoresize', 'codesample', 'emoticons'
        ],
        toolbar:
            'undo redo | styles | bold italic underline strikethrough | ' +
            'forecolor backcolor | alignleft aligncenter alignright alignjustify | ' +
            'bullist numlist outdent indent | link image media | ' +
            'table codesample emoticons | removeformat | fullscreen preview code | help',

        content_style: 'body { font-family:Helvetica,Arial,sans-serif; font-size:16px }',

        table_toolbar: 'tableprops tabledelete | tableinsertrowbefore tableinsertrowafter tabledeleterow | tableinsertcolbefore tableinsertcolafter tabledeletecol',
        image_advtab: true,
        image_caption: true,
        image_title: true,
        paste_data_images: true, // 允許直接貼上圖片
        menubar: true,
    };

    return (
        <>
            {/* 這些是全域 CSS 樣式，用來確保在編輯器外部顯示內容時，表格能有正確的樣式。 */}
            <style jsx global>{`
                .rich-text-content table {
                    width: 100% !important;
                    border-collapse: collapse;
                }
                .rich-text-content td,
                .rich-text-content th {
                    border: 1px solid #ccc;
                    padding: 8px;
                }
            `}</style>
            <Editor
                apiKey={settings.NEXT_PUBLIC_TINYMCE_API_KEY || process.env.NEXT_PUBLIC_TINYMCE_API_KEY}
                onInit={(evt, editor) => editorRef.current = editor}
                
                value={value || ''}
                
                onEditorChange={handleEditorChange}
                disabled={disabled}
                init={{ ...defaultInit, ...init }}
            />
        </>
    );
};

export default TinyMceEditor;
