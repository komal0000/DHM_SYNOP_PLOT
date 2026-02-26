from django.http import HttpResponse, JsonResponse
from django.views import View
import requests
import logging

# logger = logging.getLogger(_name_)

class GeoServerProxy(View):
    GEOSERVER_BASE_URL = "http://localhost:8080/geoserver"
    
    def get(self, request, wms_path):
        try:
            # Get query parameters
            params = request.GET.dict()
            
            # Build the full GeoServer URL
            geoserver_url = f"{self.GEOSERVER_BASE_URL}/{wms_path}"
            
            # Log the request for debugging
            logger.info(f"Proxying to GeoServer: {geoserver_url}")
            logger.info(f"Query params: {params}")
            
            # Make request to GeoServer
            response = requests.get(geoserver_url, params=params, timeout=30)
            
            # Log response status
            logger.info(f"GeoServer response status: {response.status_code}")
            
            # If GeoServer returned an error, log it
            if response.status_code >= 400:
                logger.error(f"GeoServer error response: {response.text[:500]}")
            
            # Get content type
            content_type = response.headers.get("Content-Type") or "application/octet-stream"
            
            # Create Django response
            django_response = HttpResponse(
                response.content,
                status=response.status_code,
                content_type=content_type
            )
            
            # Add CORS headers
            django_response["Access-Control-Allow-Origin"] = "*"
            django_response["Access-Control-Allow-Methods"] = "GET, OPTIONS"
            django_response["Access-Control-Allow-Headers"] = "Content-Type"
            
            return django_response
            
        except requests.exceptions.ConnectionError as e:
            logger.error(f"Cannot connect to GeoServer: {str(e)}")
            return JsonResponse({
                'error': 'Cannot connect to GeoServer',
                'details': str(e),
                'geoserver_url': self.GEOSERVER_BASE_URL
            }, status=502)
            
        except requests.exceptions.Timeout as e:
            logger.error(f"GeoServer request timeout: {str(e)}")
            return JsonResponse({
                'error': 'GeoServer request timeout',
                'details': str(e)
            }, status=504)
            
        except Exception as e:
            logger.error(f"GeoServer proxy error: {str(e)}", exc_info=True)
            return JsonResponse({
                'error': 'GeoServer proxy error',
                'details': str(e)
            }, status=500)
    
    def options(self, request, wms_path):
        """Handle OPTIONS request for CORS preflight"""
        response = HttpResponse()
        response["Access-Control-Allow-Origin"] = "*"
        response["Access-Control-Allow-Methods"] = "GET, OPTIONS"
        response["Access-Control-Allow-Headers"] = "Content-Type"
        return response
