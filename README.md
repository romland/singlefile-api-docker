# SingleGile API in Docker
SingleFile web API in a Docker container.

I have merely tweaked things to get them to work in 2024.

The real work by:
- https://github.com/gildas-lormeau/SingleFile
- https://github.com/screenbreak/SingleFile-dockerized

## Build
```bash
git clone https://github.com/romland/singfile-api-docker.git
cd singlefile-api-docker
./build.sh
```

## Run
```bash
./run.sh
```

## Test
```bash
curl -d 'url=http://www.example.com/' localhost:8001
```
...which should return the HTML+resources at that url.

