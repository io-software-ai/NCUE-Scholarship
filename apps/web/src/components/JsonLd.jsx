import React from 'react';

const JsonLd = ({ data }) => {
  if (!data) return null;

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'NewsArticle',
    headline: data.title,
    datePublished: data.created_at,
    dateModified: data.updated_at,
    description: data.summary ? data.summary.replace(/<[^>]+>/g, '') : '',
    author: {
      '@type': 'Organization',
      name: '彰師生輔組',
    },
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026') }}
    />
  );
};

export default JsonLd;
