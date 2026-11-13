import type { Metadata } from 'next';
import './globals.css';
export const metadata:Metadata={title:'School Ledger · Fees & Accounts',description:'School fees, salaries and accounts in one clear ledger.',manifest:'/manifest.webmanifest',appleWebApp:{capable:true,statusBarStyle:'default',title:'School Ledger'},icons:{icon:'/icons/icon-192.png',apple:'/icons/apple-touch-icon.png'}};
export const viewport={width:'device-width',initialScale:1,themeColor:'#346b55'};
export default function Layout({children}:{children:React.ReactNode}){return <html lang="en"><body>{children}</body></html>}
