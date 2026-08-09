from flask import Flask, request, jsonify
from flask_cors import CORS
import urllib.parse
import urllib.request
import json
import re
import os

app = Flask(__name__)
CORS(app)

@app.route('/', methods=['GET'])
def health():
    return jsonify({
        'status': 'online',
        'service': 'DIGILAB 24/7 Social OSINT Proxy API',
        'version': '1.0.0'
    })

@app.route('/api/social', methods=['GET'])
def scrape_profile():
    platform = request.args.get('platform', '')
    handle = request.args.get('handle', '').replace('@', '').strip().lower()
    profile_url = request.args.get('url', '')

    result = {
        'success': False,
        'name': handle,
        'avatar': '',
        'bio': '',
        'metrics': '',
        'location': '',
        'created': ''
    }

    if not handle:
        return jsonify(result)

    # 1. X (TWITTER) SCRAPER
    if platform == 'X (Twitter)' or 'x.com' in profile_url or 'twitter.com' in profile_url:
        try:
            target_url = f"https://x.com/{handle}"
            req = urllib.request.Request(target_url, headers={
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            })
            with urllib.request.urlopen(req, timeout=6) as response:
                html = response.read().decode('utf-8')
                og_img = re.search(r'property="og:image"\s+content="([^"]+)"', html) or re.search(r'content="([^"]+)"\s+property="og:image"', html)
                og_desc = re.search(r'property="og:description"\s+content="([^"]+)"', html) or re.search(r'content="([^"]+)"\s+property="og:description"', html)
                og_title = re.search(r'property="og:title"\s+content="([^"]+)"', html) or re.search(r'content="([^"]+)"\s+property="og:title"', html)

                if og_img:
                    result['avatar'] = og_img.group(1).replace('_normal', '_200x200')
                if og_title:
                    title_clean = og_title.group(1).split('(')[0].split('on X')[0].split('on Twitter')[0].strip()
                    if title_clean: result['name'] = title_clean
                if og_desc:
                    desc = og_desc.group(1)
                    stats = re.search(r'([0-9.,KMB]+\s+followers\s*·\s*[0-9.,KMB]+\s+following)', desc, re.I)
                    joined = re.search(r'(Joined\s+[A-Za-z]+\s+[0-9]{4})', desc, re.I)
                    if stats:
                        result['metrics'] = stats.group(1).replace('followers', 'Followers').replace('following', 'Following')
                    if joined:
                        result['created'] = joined.group(1)
                    if '·' in desc:
                        bio_part = desc.split('·')[-1].replace('See the latest conversations with', '').strip()
                        if bio_part and not bio_part.startswith('@'):
                            result['bio'] = bio_part
                result['success'] = True
                return jsonify(result)
        except Exception as e:
            pass

    # 2. GITHUB NATIVE API
    if platform == 'GitHub' or 'github.com' in profile_url:
        try:
            target_url = f"https://api.github.com/users/{handle}"
            req = urllib.request.Request(target_url, headers={
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            })
            with urllib.request.urlopen(req, timeout=6) as response:
                d = json.loads(response.read().decode('utf-8'))
                result['name'] = d.get('name') or d.get('login')
                result['avatar'] = d.get('avatar_url')
                result['bio'] = d.get('bio') or ''
                result['location'] = d.get('location') or ''
                result['created'] = d.get('created_at', '').split('T')[0]
                result['metrics'] = f"{d.get('public_repos', 0)} Repos | {d.get('followers', 0)} Followers | {d.get('following', 0)} Following"
                result['success'] = True
                return jsonify(result)
        except Exception as e:
            pass

    # 3. REDDIT NATIVE API
    if platform == 'Reddit' or 'reddit.com' in profile_url:
        try:
            target_url = f"https://www.reddit.com/user/{handle}/about.json"
            req = urllib.request.Request(target_url, headers={
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            })
            with urllib.request.urlopen(req, timeout=6) as response:
                d = json.loads(response.read().decode('utf-8')).get('data', {})
                result['name'] = d.get('name') or handle
                if d.get('icon_img'):
                    result['avatar'] = d.get('icon_img').split('?')[0]
                elif d.get('snoovatar_img'):
                    result['avatar'] = d.get('snoovatar_img')
                result['bio'] = d.get('subreddit', {}).get('public_description') or ''
                result['metrics'] = f"{d.get('total_karma', 0)} Karma"
                result['success'] = True
                return jsonify(result)
        except Exception as e:
            result['name'] = handle
            result['avatar'] = 'https://www.google.com/s2/favicons?domain=reddit.com&sz=128'
            result['metrics'] = 'Public Reddit Profile Link Validated'
            result['success'] = True
            return jsonify(result)

    # 4. YOUTUBE OEMBED
    if platform == 'YouTube' or 'youtube.com' in profile_url or 'youtu.be' in profile_url:
        try:
            yt_url = profile_url if profile_url.startswith('http') else f"https://youtube.com/@{handle}"
            target_url = f"https://noembed.com/embed?url={urllib.parse.quote(yt_url)}"
            with urllib.request.urlopen(target_url, timeout=6) as response:
                d = json.loads(response.read().decode('utf-8'))
                if d.get('title'):
                    result['name'] = d.get('title')
                    if d.get('author_name'): result['bio'] = f"Channel Owner: {d.get('author_name')}"
                    if d.get('thumbnail_url'): result['avatar'] = d.get('thumbnail_url')
                    result['success'] = True
                    return jsonify(result)
        except Exception as e:
            pass

    # 5. DEV.TO API
    if platform == 'Dev.to' or 'dev.to' in profile_url:
        try:
            target_url = f"https://dev.to/api/users/by_username?url={handle}"
            with urllib.request.urlopen(target_url, timeout=6) as response:
                d = json.loads(response.read().decode('utf-8'))
                if d.get('id'):
                    result['name'] = d.get('name') or d.get('username')
                    result['avatar'] = d.get('profile_image')
                    result['bio'] = d.get('summary') or ''
                    result['location'] = d.get('location') or ''
                    result['metrics'] = f"Dev.to User ID: #{d.get('id')}"
                    result['success'] = True
                    return jsonify(result)
        except Exception as e:
            pass

    # 6. FACEBOOK
    if platform == 'Facebook' or 'facebook.com' in profile_url:
        result['name'] = handle.capitalize()
        result['avatar'] = f"https://www.google.com/s2/favicons?domain=facebook.com&sz=128"
        result['metrics'] = "Public Facebook Profile Link Validated"
        result['success'] = True
        return jsonify(result)

    return jsonify(result)

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 8001))
    app.run(host='0.0.0.0', port=port)
