# SingleFile API in Docker
SingleFile web API in a Docker container.

If I get around to it, I will make it interface with `SingleFile` using node instead of CLI.

With script-injection into the page, this will now extract meta-data that it returns as JSON
at the API endpoint.

## Meta data
The primary goal is to extract the relevant text from a page full of cruft. You can find that
in `extracts` (array).

## Build
```bash
git clone https://github.com/romland/singlefile-api-docker.git
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


## The real work by:
- https://github.com/gildas-lormeau/SingleFile
