#!/bin/bash
mkdir -p ./dist

cd ./pwa
npm run build
cd ../

cd ./android
make
cp ./pbg_oracle.apk ../dist/

