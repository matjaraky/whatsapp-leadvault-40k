/**
 * Copyright 2018 Google Inc. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *     http://www.apache.org/licenses/LICENSE-2.0
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

// If the loader is already loaded, just stop.
if (!self.define) {
  let registry = {};

  // Used for `eval` and `importScripts` where we can't get script URL by other means.
  // In both cases, it's safe to use a global var because those functions are synchronous.
  let nextDefineUri;

  const singleRequire = (uri, parentUri) => {
    uri = new URL(uri + ".js", parentUri).href;
    return registry[uri] || (
      
        new Promise(resolve => {
          if ("document" in self) {
            const script = document.createElement("script");
            script.src = uri;
            script.onload = resolve;
            document.head.appendChild(script);
          } else {
            nextDefineUri = uri;
            importScripts(uri);
            resolve();
          }
        })
      
      .then(() => {
        let promise = registry[uri];
        if (!promise) {
          throw new Error(`Module ${uri} didn’t register its module`);
        }
        return promise;
      })
    );
  };

  self.define = (depsNames, factory) => {
    const uri = nextDefineUri || ("document" in self ? document.currentScript.src : "") || location.href;
    if (registry[uri]) {
      // Module is already loading or loaded.
      return;
    }
    let exports = {};
    const require = depUri => singleRequire(depUri, uri);
    const specialDeps = {
      module: { uri },
      exports,
      require
    };
    registry[uri] = Promise.all(depsNames.map(
      depName => specialDeps[depName] || require(depName)
    )).then(deps => {
      factory(...deps);
      return exports;
    });
  };
}
define(['./workbox-d667eb67'], (function (workbox) { 'use strict';

  self.addEventListener('message', event => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
      self.skipWaiting();
    }
  });

  /**
   * The precacheAndRoute() method efficiently caches and responds to
   * requests for URLs in the manifest.
   * See https://goo.gl/S9QRab
   */
  workbox.precacheAndRoute([{
    "url": "pwa-maskable-512x512.png",
    "revision": "482c8fa9f9ec3996f1f6ac8631214144"
  }, {
    "url": "pwa-512x512.png",
    "revision": "482c8fa9f9ec3996f1f6ac8631214144"
  }, {
    "url": "pwa-192x192.png",
    "revision": "fdf22a39cd0454bdec2b9cda309e4c9f"
  }, {
    "url": "index.html",
    "revision": "aa710b0a5002fd06744988637bb10051"
  }, {
    "url": "icon.svg",
    "revision": "621f17a7c2a06b315645e269b3681d60"
  }, {
    "url": "apple-touch-icon.png",
    "revision": "56cefc46d604e8c5cfbc17ed875cb417"
  }, {
    "url": "assets/index-DlJmx0DJ.css",
    "revision": null
  }, {
    "url": "assets/index-CYOo_Z7G.js",
    "revision": null
  }, {
    "url": "android-icons/mipmap-xxxhdpi/ic_launcher_round.png",
    "revision": "c9e8fdaca7c190769a6ca77d7895a9f5"
  }, {
    "url": "android-icons/mipmap-xxxhdpi/ic_launcher_foreground.png",
    "revision": "37539cb39abd2687f8f217e4b081619e"
  }, {
    "url": "android-icons/mipmap-xxxhdpi/ic_launcher.png",
    "revision": "c9e8fdaca7c190769a6ca77d7895a9f5"
  }, {
    "url": "android-icons/mipmap-xxhdpi/ic_launcher_round.png",
    "revision": "2749eaf8402e663172a84fa903702796"
  }, {
    "url": "android-icons/mipmap-xxhdpi/ic_launcher_foreground.png",
    "revision": "96d5d035be43348d4a81ec94383fb588"
  }, {
    "url": "android-icons/mipmap-xxhdpi/ic_launcher.png",
    "revision": "2749eaf8402e663172a84fa903702796"
  }, {
    "url": "android-icons/mipmap-xhdpi/ic_launcher_round.png",
    "revision": "662cb2177d73235a51092a2069afe24c"
  }, {
    "url": "android-icons/mipmap-xhdpi/ic_launcher_foreground.png",
    "revision": "2d91160c49fc52f820fac4d8e615f3c3"
  }, {
    "url": "android-icons/mipmap-xhdpi/ic_launcher.png",
    "revision": "662cb2177d73235a51092a2069afe24c"
  }, {
    "url": "android-icons/mipmap-mdpi/ic_launcher_round.png",
    "revision": "f15cb499ed89177dd06a22a14736878e"
  }, {
    "url": "android-icons/mipmap-mdpi/ic_launcher_foreground.png",
    "revision": "33365dd748de0b36b42f907b67f71ea1"
  }, {
    "url": "android-icons/mipmap-mdpi/ic_launcher.png",
    "revision": "f15cb499ed89177dd06a22a14736878e"
  }, {
    "url": "android-icons/mipmap-hdpi/ic_launcher_round.png",
    "revision": "95e2773f27796012eaf939cbfdc476b4"
  }, {
    "url": "android-icons/mipmap-hdpi/ic_launcher_foreground.png",
    "revision": "6ac377f108ee4726091467801c90c8bc"
  }, {
    "url": "android-icons/mipmap-hdpi/ic_launcher.png",
    "revision": "95e2773f27796012eaf939cbfdc476b4"
  }, {
    "url": "apple-touch-icon.png",
    "revision": "56cefc46d604e8c5cfbc17ed875cb417"
  }, {
    "url": "icon.svg",
    "revision": "621f17a7c2a06b315645e269b3681d60"
  }, {
    "url": "pwa-192x192.png",
    "revision": "fdf22a39cd0454bdec2b9cda309e4c9f"
  }, {
    "url": "pwa-512x512.png",
    "revision": "482c8fa9f9ec3996f1f6ac8631214144"
  }, {
    "url": "pwa-maskable-512x512.png",
    "revision": "482c8fa9f9ec3996f1f6ac8631214144"
  }, {
    "url": "version.json",
    "revision": "2f4a97c0a1acf0e0df6f574a18418b77"
  }, {
    "url": "manifest.webmanifest",
    "revision": "b74c20420c03450ae9205a9a65a75143"
  }], {});
  workbox.cleanupOutdatedCaches();
  workbox.registerRoute(new workbox.NavigationRoute(workbox.createHandlerBoundToURL("index.html"), {
    denylist: [/^\/version\.json/]
  }));
  workbox.registerRoute(/\/version\.json$/, new workbox.NetworkOnly(), 'GET');
  workbox.registerRoute(/^https:\/\/fonts\.googleapis\.com\/.*/i, new workbox.CacheFirst({
    "cacheName": "google-fonts-cache",
    plugins: [new workbox.ExpirationPlugin({
      maxEntries: 10,
      maxAgeSeconds: 31536000
    }), new workbox.CacheableResponsePlugin({
      statuses: [0, 200]
    })]
  }), 'GET');
  workbox.registerRoute(/^https:\/\/fonts\.gstatic\.com\/.*/i, new workbox.CacheFirst({
    "cacheName": "gstatic-fonts-cache",
    plugins: [new workbox.ExpirationPlugin({
      maxEntries: 10,
      maxAgeSeconds: 31536000
    }), new workbox.CacheableResponsePlugin({
      statuses: [0, 200]
    })]
  }), 'GET');

}));
