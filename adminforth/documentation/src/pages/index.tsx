import clsx from 'clsx';
import Link from '@docusaurus/Link';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import Layout from '@theme/Layout';
import HomepageFeatures from '@site/src/components/HomepageFeatures';
import Heading from '@theme/Heading';
import { useState } from 'react';
import ExecutionEnvironment from '@docusaurus/ExecutionEnvironment';
import styles from './index.module.css';


const images = [
  {
    original: require('@site/static/img/previews/login_form.png').default,
    title: 'Sign in form',
    link: '/docs/tutorial/gettingStarted',
    description: 'OWASP-Compliant Sign-In and JWT-SSO already there'
  },
  {
    original: require('@site/static/img/previews/users_management.png').default,
    title: 'Users management',
    link: '/docs/tutorial/gettingStarted',
    description: 'Manage users and roles with ease, extend as you like'
  },
  {
    original: require('@site/static/img/previews/ai_complete.png').default,
    title: 'AI autocomplete Plugin - write with ChatGPT',
    link: '/docs/tutorial/Plugins/chat-gpt/',
    description: 'Provide your OpenAI API key to autocomplete plugin and AI will help you to write your content using record context'
  },
  {
    original: require('@site/static/img/previews/auditlog.png').default,
    title: 'Audit log Plugin - know who did what',
    link: '/docs/tutorial/Plugins/AuditLog/',
    description: 'Attach Audit log plugin with couple of lines, create table for logs and track your users actions'
  },
  {
    original: require('@site/static/img/previews/2fa_plugin.png').default,
    title: '2FA Plugin - secure your admin panel',
    link: '/docs/tutorial/Plugins/TwoFactorsAuth/',
    description: 'RFC 6238-Compliant TOTP-Based 2FA will add additional security layer to your admin panel'
  },
  {
    original: require('@site/static/img/previews/dark.png').default,
    title: 'Dark mode out of the box',
    link: '/docs/tutorial/gettingStarted',
    description: 'Dark mode is enabled by default, create your own components in Tailwind-way and it will work with no additional friction'
  },
  {
    original: require('@site/static/img/previews/upload.png').default,
    title: 'Upload Plugin - upload files',
    link: '/docs/tutorial/Plugins/Upload/',
    description: 'Upload files to Amazon S3 with instantiating plugin and providing your S3 credentials' 
  },
  {
    original: require('@site/static/img/previews/dashboard.png').default,
    title: 'Custom Pages and Dashboards',
    link: '/docs/tutorial/Customization/customPages/',
    description: 'Create your own pages and dashboards with Vue3 components. Add any additional npm packages and extend your admin panel as you like'
  },
  {
    original: require('@site/static/img/previews/branding.png').default,
    title: 'Branding and theming',
    link: '/docs/tutorial/Customization/branding/',
    description: 'Upload your logo, change colors, update titles, make the look to match your brand'
  },
  {
    original: require('@site/static/img/previews/richeditor.png').default,
    title: 'Rich Editor Plugin - WYSIWYG',
    link: '/docs/tutorial/Plugins/RichEditor/',
    description: 'Attach Rich Editor plugin to your text fields and get WYSIWYG editor for your content'
  }
];


function HomepageHeader() {
  const {siteConfig} = useDocusaurusContext();
  
  const [ theme, setTheme ] = useState('light');

  if (ExecutionEnvironment.canUseDOM) {

    // implement theme switching like in horror movie- wailt a little bit and then switch aggressively blinking
    async function wait(ms: number) {
      return new Promise(resolve => {
        setTimeout(resolve, ms);
      });
      
    }

    const HORROR_DELAYS_MS = [2800, 150, 2100, 200, 50, 50, 1200, 300, 3124, 337, 1000, 200, 3124, 4200, 10, 10, 1000, 300];  

    async function switchThemeHorrific() {
      

      for (let i = 0; i < HORROR_DELAYS_MS.length; i++) {
        await wait(HORROR_DELAYS_MS[i]);
        if (HORROR_DELAYS_MS[i] === 3124) {
          setTheme('screem');
          continue;
        }
        setTheme(i % 2 === 0 ? 'dark' : 'light');
      }
      switchThemeHorrific();
    }
    if (!window.horrorStarted ) {
      switchThemeHorrific();
      window.horrorStarted = true;
    }
  } 

  return (
    <>
      <header className={clsx('hero', styles.heroBanner)}>
        <div className="container" >
          <Heading as="h1" className={clsx('hero__title', styles.heroBannerTitle)} >
            Create Admin Panels faster on Node and Vue with AdminForth Framework
          </Heading>
          <p className="hero__subtitle">{siteConfig.tagline}</p>
          <div className={styles.buttons}>
            <Link
              className="button button--secondary button--outline button--lg"
              to="/docs/tutorial/gettingStarted">
              Get started - 5min ⏱️
            </Link>

            <Link
              className="button button--primary button--lg"
              to="https://demo.adminforth.dev/">
              Live Demo
            </Link>
          </div>
        </div>
      </header>


        <div className="laptop_container">
          <div className="laptop">
            <div className="laptop__screen">
              <img 
                src={{
                    light: require('@site/static/img/preview_light.png').default,
                    dark: require('@site/static/img/preview_dark.png').default,
                    screem: require('@site/static/img/screem.png').default,
                  }[theme]
                } alt="Screen" />
                
            </div>
            <div className="laptop__bottom">
              <div className="laptop__under"></div>
            </div>
            <div className="laptop__shadow"></div>
          </div>
        </div>

    </>
  );
}

export default function Home(): JSX.Element {
  const {siteConfig} = useDocusaurusContext();
  return (
    <Layout
      title={`${siteConfig.title}`}
      description="OpenSource Tailwind Admin Panel extendable with Vue3 and typescript!">
      <HomepageHeader />
      <main>

      <Heading as="h2" className="hero__title text--center">
        What it can do for you
      </Heading>

        <div style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '4rem',
          justifyContent: 'center',
          padding: '1rem',
        }}>
          {images.map((item, index) => (
            <div class="card-demo">
              <div class="card shadow--md" style={{
                      maxWidth: '500px',
                    }}> 
                <div class="card__image">
                  <img
                    src={item.original}
                    alt={item.title}
                    title={item.title}
                    
                  />
                </div>
                <div class="card__body">
                  <h3>{item.title}</h3>
                  {
                    item.description ?
                    <small>
                      {item.description}
                    </small> :
                    <small></small>
                  }
                </div>
                <div class="card__footer">
                  <a class="button button--primary button--block"
                    href={item.link}
                  >Learn how</a>
                </div>
              </div>
            </div>
          ))}


        </div>

        <HomepageFeatures />

      </main>

    </Layout>
  );
}
